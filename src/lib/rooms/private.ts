import { randomBytes, randomInt } from "node:crypto";
import { normalizeChannel } from "@/shared/twitch";
import { defaultGameServer, dropRoomData } from "@/lib/games/servers";
import { prisma } from "../prisma";
import {
  kindDbValue,
  normalizeTitle,
  parseKind,
  MAX_PLAYERS_LIMIT,
  MIN_PLAYERS_LIMIT,
  ROOM_CODE_LENGTH,
  type RoomKind,
  type RoomKindDb,
} from "@/shared/room-settings";

/**
 * Приватные комнаты: создание, разбор ссылки-приглашения и уборка опустевших
 * (см. src/games/pricetitute/docs/SPEC.md §3.2).
 */

/** Без нуля, единицы и похожих букв: код диктуют голосом. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ALPHABET = ROOM_CODE_ALPHABET;

/**
 * Сколько живых комнат может держать один хозяин (docs/SECURITY.md, S-D2).
 * Обычному человеку хватает одной-двух; десять — это уже конвейер.
 */
export const MAX_ROOMS_PER_HOST = 10;

/** Через сколько после ухода последнего игрока комната удаляется. */
export const EMPTY_LIFETIME_MS = 30 * 60 * 1000;

/**
 * Настройки комнаты глазами платформы. Правила партии сюда не входят: их
 * объявляет игра и хранит у себя (docs/BACKLOG.md A4).
 */
export interface PrivateRoomSettings {
  /** Какого рода комната: своя, стримерская или домашняя. */
  kind: RoomKind;
  /** Название комнаты: рисуется на экране. У обычной приватной его нет. */
  title: string | null;
  /** Набор закрыт: новых за стол не пускают. */
  locked: boolean;
  /** Больше этого числа за стол не сажаем. null — без ограничения. */
  maxPlayers: number | null;
  /** Канал Твича, чей чат слушает комната. */
  twitchChannel: string | null;
}

export interface PrivateRoomInfo extends PrivateRoomSettings {
  id: string;
  code: string;
  hostId: string;
  /** Во что тут играют. */
  gameId: string;
  /** Ключ вида «экран»: по нему туда пускают без сессии. */
  screenKey: string;
}

export async function createPrivateRoom(
  hostId: string,
  settings: PrivateRoomSettings,
  gameId: string = defaultGameServer().id,
): Promise<PrivateRoomInfo> {
  // Код короткий, поэтому столкновения возможны — пробуем несколько раз.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();

    try {
      const room = await prisma.privateRoom.create({
        data: {
          code,
          hostId,
          gameId,
          kind: kindDbValue(settings.kind),
          title: settings.title,
          maxPlayers: settings.maxPlayers,
          twitchChannel: settings.twitchChannel,
          screenKey: generateScreenKey(),
          // Пуста с рождения: первый вход сбросит отметку. Без неё комната,
          // в которую так и не зашли, не удалялась бы никогда (S-D2).
          emptySince: new Date(),
        },
      });

      return toInfo(room);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  throw new Error("Не удалось подобрать свободный код комнаты");
}

export async function findPrivateRoom(
  code: string,
): Promise<PrivateRoomInfo | null> {
  const room = await prisma.privateRoom.findUnique({
    where: { code: code.toUpperCase() },
  });

  return room ? toInfo(room) : null;
}

/** Сколько комнат сейчас держит хозяин. */
export async function countRoomsOf(hostId: string): Promise<number> {
  return prisma.privateRoom.count({ where: { hostId } });
}

/**
 * Проставить отсчёт комнатам, которые никто не держит, а отметки у них нет.
 *
 * Так бывает в двух случаях: комната заведена до того, как отсчёт стал
 * ставиться при создании, или в ней сидели люди, когда сервер перезапустили, —
 * выйти «правильно» они уже не могли. Без этого такие комнаты не удалялись бы
 * никогда (docs/SECURITY.md, S-D2). `live` — ключи комнат, поднятых в памяти:
 * их жизнь ведёт менеджер комнат.
 */
export async function markOrphanRooms(
  live: readonly string[],
  at: Date,
  /** Только комнаты этого хозяина. Для смоука: база бывает общей с чужим сервером. */
  hostId?: string,
): Promise<number> {
  const { count } = await prisma.privateRoom.updateMany({
    where: { emptySince: null, id: { notIn: [...live] }, hostId },
    data: { emptySince: at },
  });
  return count;
}

/** Комната опустела — запускаем отсчёт до удаления. */
export async function markEmpty(roomId: string, at: Date): Promise<void> {
  await prisma.privateRoom.updateMany({
    where: { id: roomId, emptySince: null },
    data: { emptySince: at },
  });
}

/** Кто-то вернулся — отсчёт отменяется. */
export async function markBusy(roomId: string): Promise<void> {
  await prisma.privateRoom.updateMany({
    where: { id: roomId, emptySince: { not: null } },
    data: { emptySince: null },
  });
}

/** Убрать комнату вместе со всем, что игра успела про неё запомнить. */
export async function deletePrivateRoom(
  roomId: string,
  gameId: string,
): Promise<void> {
  // Свои таблицы убирает сама игра: платформа их не знает. Чья это игра,
  // спрашиваем у комнаты, а не у реестра: со второй игрой «первая в реестре»
  // означала бы уборку не в той схеме — свои строки остались бы сиротами, а
  // чужая игра получила бы чужой ключ (src/games/chess/docs/BACKLOG.md A4).
  await dropRoomData(gameId, roomId);
  await prisma.privateRoom.deleteMany({ where: { id: roomId } });
}

/** Комната на снос: что удалять и чьё это. */
export interface StaleRoom {
  id: string;
  gameId: string;
}

/** Комнаты, которые пустуют дольше положенного. */
export async function staleRooms(now: Date): Promise<StaleRoom[]> {
  // `gameId` идёт вместе с `id` не для отчётности: без него уборщик знает,
  // что удалять, но не знает чьё (src/games/chess/docs/BACKLOG.md A4).
  return prisma.privateRoom.findMany({
    where: { emptySince: { lt: new Date(now.getTime() - EMPTY_LIFETIME_MS) } },
    select: { id: true, gameId: true },
  });
}

export function generateCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/**
 * Ключ вида «экран». Диктовать его не надо — он живёт в адресе, который
 * копируют, — поэтому берём просто случайные байты, а не короткий алфавит.
 */
export function generateScreenKey(): string {
  return randomBytes(16).toString("hex");
}

/** Настройки из формы: всё за пределами разумного отбрасывается. */
export function normalizeSettings(input: {
  kind?: unknown;
  title?: unknown;
  maxPlayers?: unknown;
  twitchChannel?: unknown;
}): PrivateRoomSettings {
  const kind = parseKind(input.kind);

  return {
    kind,
    // Название есть только у комнат с экраном: у обычной приватной его негде
    // показать, и хранить его там значило бы обещать несуществующее.
    title: kind === "private" ? null : normalizeTitle(input.title),
    // Замок при создании всегда открыт: закрывать пустую комнату бессмысленно.
    locked: false,
    maxPlayers: parseMaxPlayers(input.maxPlayers),
    // Канал есть только у стримерской: домашней он ни к чему.
    twitchChannel:
      kind === "stream" && typeof input.twitchChannel === "string"
        ? normalizeChannel(input.twitchChannel)
        : null,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Лимит игроков из формы. Пусто и мусор означают «без ограничения». */
function parseMaxPlayers(value: unknown): number | null {
  const limit = Math.trunc(Number(value));
  if (!Number.isFinite(limit) || limit <= 0) return null;

  return clamp(limit, MIN_PLAYERS_LIMIT, MAX_PLAYERS_LIMIT);
}

/** Хозяин закрывает или открывает набор. */
export async function setRoomLocked(
  roomId: string,
  locked: boolean,
): Promise<void> {
  await prisma.privateRoom.updateMany({
    where: { id: roomId },
    data: { locked },
  });
}

function toInfo(room: {
  gameId: string;
  id: string;
  code: string;
  hostId: string;
  kind: RoomKindDb;
  title: string | null;
  screenKey: string;
  locked: boolean;
  maxPlayers: number | null;
  twitchChannel: string | null;
}): PrivateRoomInfo {
  return {
    id: room.id,
    code: room.code,
    hostId: room.hostId,
    gameId: room.gameId,
    kind: parseKind(room.kind),
    title: room.title,
    screenKey: room.screenKey,
    locked: room.locked,
    maxPlayers: room.maxPlayers,
    twitchChannel: room.twitchChannel,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

import { randomBytes, randomInt } from "node:crypto";
import { normalizeChannel } from "@/server/twitch/chat";
import type { EndMode } from "../game/room";
import { dropScores } from "../game/store";
import { prisma } from "../prisma";
import {
  dbValue,
  parseMode,
  type QuestionMode,
  type QuestionModeDb,
} from "../questions/modes";
import { dropQuestionQueue } from "../questions/store";
import {
  defaultRotation,
  kindDbValue,
  normalizeTitle,
  parseKind,
  parseRevealMs,
  MAX_PLAYERS_LIMIT,
  MIN_PLAYERS_LIMIT,
  parseRotation,
  ROOM_CODE_LENGTH,
  rotationDbValue,
  type HostRotation,
  type HostRotationDb,
  type RoomKind,
  type RoomKindDb,
} from "@/shared/room-settings";

/**
 * Приватные комнаты: создание, разбор ссылки-приглашения и уборка опустевших
 * (см. src/games/pricetitute/docs/SPEC.md §3.2).
 */

/** Без нуля, единицы и похожих букв: код диктуют голосом. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Через сколько после ухода последнего игрока комната удаляется. */
export const EMPTY_LIFETIME_MS = 30 * 60 * 1000;

export const MIN_BETTING_MS = 30_000;
export const MAX_BETTING_MS = 15 * 60 * 1000;
export const MAX_END_VALUE = 99;

export interface PrivateRoomSettings {
  bettingMs: number;
  /** Сколько показывать вскрышку. */
  revealMs: number;
  includeAdult: boolean;
  /** Каким набором паков играет комната. */
  mode: QuestionMode;
  endMode: EndMode;
  endValue: number | null;
  /** Какого рода комната: своя, стримерская или домашняя. */
  kind: RoomKind;
  /** Название комнаты: рисуется на экране. У обычной приватной его нет. */
  title: string | null;
  /** Кто ведёт раунды. */
  hostRotation: HostRotation;
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
  /** Ключ вида «экран»: по нему туда пускают без сессии. */
  screenKey: string;
}

const MODE_TO_DB = {
  endless: "ENDLESS",
  rounds: "ROUNDS",
  points: "POINTS",
} as const;

const MODE_FROM_DB = {
  ENDLESS: "endless",
  ROUNDS: "rounds",
  POINTS: "points",
} as const;

export async function createPrivateRoom(
  hostId: string,
  settings: PrivateRoomSettings,
): Promise<PrivateRoomInfo> {
  // Код короткий, поэтому столкновения возможны — пробуем несколько раз.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();

    try {
      const room = await prisma.privateRoom.create({
        data: {
          code,
          hostId,
          kind: kindDbValue(settings.kind),
          title: settings.title,
          hostRotation: rotationDbValue(settings.hostRotation),
          maxPlayers: settings.maxPlayers,
          twitchChannel: settings.twitchChannel,
          screenKey: generateScreenKey(),
          bettingMs: settings.bettingMs,
          revealMs: settings.revealMs,
          includeAdult: settings.includeAdult,
          mode: dbValue(settings.mode),
          endMode: MODE_TO_DB[settings.endMode],
          endValue: settings.endValue,
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

/** Убрать комнату вместе с её очередью вопросов и счётом. */
export async function deletePrivateRoom(roomId: string): Promise<void> {
  await dropQuestionQueue(roomId);
  await dropScores(roomId);
  await prisma.privateRoom.deleteMany({ where: { id: roomId } });
}

/** Комнаты, которые пустуют дольше положенного. */
export async function staleRoomIds(now: Date): Promise<string[]> {
  const rooms = await prisma.privateRoom.findMany({
    where: { emptySince: { lt: new Date(now.getTime() - EMPTY_LIFETIME_MS) } },
    select: { id: true },
  });

  return rooms.map((room) => room.id);
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
  bettingMs?: unknown;
  revealMs?: unknown;
  includeAdult?: unknown;
  mode?: unknown;
  endMode?: unknown;
  endValue?: unknown;
  kind?: unknown;
  title?: unknown;
  hostRotation?: unknown;
  maxPlayers?: unknown;
  twitchChannel?: unknown;
}): PrivateRoomSettings {
  const bettingMs = clamp(
    Number(input.bettingMs) || 300_000,
    MIN_BETTING_MS,
    MAX_BETTING_MS,
  );

  const endMode: EndMode =
    input.endMode === "rounds" || input.endMode === "points"
      ? input.endMode
      : "endless";

  const rawValue = Number(input.endValue);
  const endValue =
    endMode === "endless" || !Number.isFinite(rawValue)
      ? null
      : clamp(Math.trunc(rawValue), 1, MAX_END_VALUE);

  const kind = parseKind(input.kind);

  return {
    bettingMs,
    revealMs: parseRevealMs(input.revealMs),
    includeAdult: input.includeAdult !== false,
    mode: parseMode(input.mode),
    endMode,
    endValue,
    kind,
    // Название есть только у комнат с экраном: у обычной приватной его негде
    // показать, и хранить его там значило бы обещать несуществующее.
    title: kind === "private" ? null : normalizeTitle(input.title),
    hostRotation:
      input.hostRotation === undefined
        ? defaultRotation(kind)
        : parseRotation(input.hostRotation),
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
  id: string;
  code: string;
  hostId: string;
  kind: RoomKindDb;
  title: string | null;
  screenKey: string;
  hostRotation: HostRotationDb;
  locked: boolean;
  maxPlayers: number | null;
  twitchChannel: string | null;
  bettingMs: number;
  revealMs: number;
  includeAdult: boolean;
  mode: QuestionModeDb;
  endMode: keyof typeof MODE_FROM_DB;
  endValue: number | null;
}): PrivateRoomInfo {
  return {
    id: room.id,
    code: room.code,
    hostId: room.hostId,
    kind: parseKind(room.kind),
    title: room.title,
    screenKey: room.screenKey,
    hostRotation: parseRotation(room.hostRotation),
    locked: room.locked,
    maxPlayers: room.maxPlayers,
    twitchChannel: room.twitchChannel,
    bettingMs: room.bettingMs,
    revealMs: room.revealMs,
    includeAdult: room.includeAdult,
    mode: parseMode(room.mode),
    endMode: MODE_FROM_DB[room.endMode],
    endValue: room.endValue,
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

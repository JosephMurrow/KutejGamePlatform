import { prisma } from "@/lib/prisma";

/**
 * Настройки партии в приватной комнате: чтение, запись и уборка.
 *
 * Лежат в схеме игры, а не колонками в platform.private_rooms: платформа не
 * знает, какие у игры настройки, и хранить их у себя не может
 * (docs/DATABASE.md, src/games/chess/docs/BACKLOG.md A4).
 */

/**
 * Контроль времени. Свой тип, а не импорт из сгенерированного клиента: игра
 * не должна зависеть от того, что и когда сгенерировала Prisma — так же
 * сделано у платитутки.
 */
export type TimeControl = "SEC_10" | "SEC_30" | "MIN_1" | "MIN_3" | "UNLIMITED";

/** Кто по ту сторону доски. */
export type OpponentKind = "HUMAN" | "BOT";

export interface ChessRoomSettings {
  timeControl: TimeControl;
  opponent: OpponentKind;
  streamerMode: boolean;
}

/**
 * Сколько миллисекунд даётся на ход. `null` — без ограничения: платформа в
 * этом случае будильник не заводит вовсе
 * (src/games/chess/docs/BACKLOG.md A2).
 */
export const MOVE_LIMIT_MS: Record<TimeControl, number | null> = {
  SEC_10: 10_000,
  SEC_30: 30_000,
  MIN_1: 60_000,
  MIN_3: 180_000,
  UNLIMITED: null,
};

/** Как контроль времени называется в интерфейсе. */
export const TIME_CONTROL_LABEL: Record<TimeControl, string> = {
  SEC_10: "10 секунд",
  SEC_30: "30 секунд",
  MIN_1: "1 минута",
  MIN_3: "3 минуты",
  UNLIMITED: "без ограничения",
};

/** Полминуты на ход и живой соперник — то же, чем играет общий зал. */
export function defaultRoomSettings(): ChessRoomSettings {
  return { timeControl: "SEC_30", opponent: "HUMAN", streamerMode: false };
}

const TIME_CONTROLS = Object.keys(MOVE_LIMIT_MS) as TimeControl[];
const OPPONENTS: OpponentKind[] = ["HUMAN", "BOT"];

/**
 * Разобрать то, что пришло из формы. Значения приходят от клиента, поэтому
 * каждое сверяется со списком, а не приводится типом.
 */
export function normalizeRoomSettings(raw: {
  timeControl: unknown;
  opponent: unknown;
  streamerMode: unknown;
}): ChessRoomSettings {
  const fallback = defaultRoomSettings();

  return {
    timeControl: pick(raw.timeControl, TIME_CONTROLS, fallback.timeControl),
    opponent: pick(raw.opponent, OPPONENTS, fallback.opponent),
    streamerMode: raw.streamerMode === true || raw.streamerMode === "on",
  };
}

export async function saveRoomSettings(
  roomId: string,
  settings: ChessRoomSettings,
): Promise<void> {
  await prisma.chessRoomSettings.upsert({
    where: { roomId },
    create: { roomId, ...settings },
    update: settings,
  });
}

/**
 * Настройки комнаты. Строки может не быть — комнату могли завести до того, как
 * игра научилась их писать, — тогда играем умолчанием.
 */
export async function loadRoomSettings(
  roomId: string,
): Promise<ChessRoomSettings> {
  const row = await prisma.chessRoomSettings.findUnique({ where: { roomId } });
  if (!row) return defaultRoomSettings();

  return {
    timeControl: row.timeControl,
    opponent: row.opponent,
    streamerMode: row.streamerMode,
  };
}

/** Комнату удалили: своя строка уходит вместе с ней. */
export async function dropRoomSettings(roomId: string): Promise<void> {
  await prisma.chessRoomSettings.deleteMany({ where: { roomId } });
}

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

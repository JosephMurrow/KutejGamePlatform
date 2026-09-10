/**
 * Настройки партии: типы, пределы и разбор формы.
 *
 * Отдельно от `store.ts` намеренно: тот ходит в базу, а это нужно и движку, и
 * компонентам — тянуть за ними Prisma незачем.
 */

/**
 * Контроль времени. Свой тип, а не импорт из сгенерированного клиента: игра
 * не должна зависеть от того, что и когда сгенерировала Prisma — так же
 * сделано у платитутки.
 */
export type TimeControl = "SEC_10" | "SEC_30" | "MIN_1" | "MIN_3" | "UNLIMITED";

/** Кто по ту сторону доски. */
export type OpponentKind = "HUMAN" | "BOT";

/**
 * Уровень бота, как он лежит в базе.
 *
 * `MAGNUS` скрытый: в форме он появляется только у того, кто его открыл
 * (src/games/chess/docs/BACKLOG.md D3).
 */
export type BotLevelDb = "EASY" | "NORMAL" | "HARD" | "EXPERT" | "MAGNUS";

/**
 * На сколько зрителям показывают партию позже игроков.
 *
 * Нужна тем, кто играет в эфире: зритель на нашем сайте видит ход мгновенно, а
 * зритель трансляции — через полминуты, и наш зритель опережает эфир. Значит он
 * может подсказать сопернику в чате Твича (src/games/chess/docs/BACKLOG.md F2).
 */
export type ViewerDelay = "NONE" | "SEC_15" | "SEC_30" | "SEC_60";

export interface ChessRoomSettings {
  timeControl: TimeControl;
  opponent: OpponentKind;
  streamerMode: boolean;
  /** Значим, только когда соперник — бот. */
  botLevel: BotLevelDb;
  /** На сколько зрители отстают от игроков. */
  viewerDelay: ViewerDelay;
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

/** Задержка зрителей в миллисекундах. Ноль — зрители видят всё сразу. */
export const VIEWER_DELAY_MS: Record<ViewerDelay, number> = {
  NONE: 0,
  SEC_15: 15_000,
  SEC_30: 30_000,
  SEC_60: 60_000,
};

/** Как задержка называется в интерфейсе. */
export const VIEWER_DELAY_LABEL: Record<ViewerDelay, string> = {
  NONE: "без задержки",
  SEC_15: "15 секунд",
  SEC_30: "30 секунд",
  SEC_60: "минута",
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
  return {
    timeControl: "SEC_30",
    opponent: "HUMAN",
    streamerMode: false,
    botLevel: "NORMAL",
    viewerDelay: "NONE",
  };
}

const TIME_CONTROLS = Object.keys(MOVE_LIMIT_MS) as TimeControl[];
const OPPONENTS: OpponentKind[] = ["HUMAN", "BOT"];
const BOT_LEVELS: BotLevelDb[] = ["EASY", "NORMAL", "HARD", "EXPERT", "MAGNUS"];
const VIEWER_DELAYS = Object.keys(VIEWER_DELAY_MS) as ViewerDelay[];

/**
 * Разобрать то, что пришло из формы. Значения приходят от клиента, поэтому
 * каждое сверяется со списком, а не приводится типом.
 */
export function normalizeRoomSettings(raw: {
  timeControl: unknown;
  opponent: unknown;
  streamerMode: unknown;
  botLevel: unknown;
  viewerDelay: unknown;
}): ChessRoomSettings {
  const fallback = defaultRoomSettings();

  return {
    timeControl: pick(raw.timeControl, TIME_CONTROLS, fallback.timeControl),
    opponent: pick(raw.opponent, OPPONENTS, fallback.opponent),
    streamerMode: raw.streamerMode === true || raw.streamerMode === "on",
    botLevel: pick(raw.botLevel, BOT_LEVELS, fallback.botLevel),
    viewerDelay: pick(raw.viewerDelay, VIEWER_DELAYS, fallback.viewerDelay),
  };
}

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

import { modeInfo, PLAYER_MODES, type TurboMode } from "../modes/catalog";
import { LEVEL_IDS, type LevelId } from "../bots/levels";
import { modeOptions } from "../modes/rules";

/**
 * Настройки партии: типы, умолчание и разбор формы.
 *
 * Отдельно от `store.ts` намеренно: тот ходит в базу, а это нужно и движку, и
 * компонентам — тянуть за ними Prisma незачем. Так же разделено у шахмат.
 */

/**
 * Ручки режима: вид фигур у одновидовых, порог заряда у ядерных и так далее.
 *
 * Только простые значения — они лежат в базе одним полем JSON
 * (prisma/schema/turbochess.prisma). Ручки есть не у всех режимов, и
 * настройки каждого согласуются в начале его этапа (docs/MODES.md).
 */
export type ModeOptions = Record<string, string | number | boolean>;

/**
 * Контроль времени. Лимит на ход, а не бюджет на партию — как у шахмат, и по
 * той же причине: это ровно один дедлайн, и он ложится на будильник
 * платформы без правки договора.
 */
export type TimeControl = "SEC_10" | "SEC_30" | "MIN_1" | "MIN_3" | "UNLIMITED";

export interface TurboRoomSettings {
  mode: TurboMode;
  timeControl: TimeControl;
  options: ModeOptions;
  /**
   * Сколько ботов сажать за стол. Ноль — ждём живых; больше одного бывает
   * только в королевской битве, где мест четыре, и последнее место всё равно
   * остаётся человеку (docs/BOTS.md, А6 и А8).
   */
  bots: number;
  /** Уровень всех ботов комнаты: выбирает человек, различают характеры. */
  botLevel: LevelId;
}

/** Сколько мест в этом режиме можно отдать программе: одно всегда за человеком. */
export function botRoom(mode: TurboMode): number {
  return Math.max(0, modeInfo(mode).seats - 1);
}

/** Сколько ботов просили и сколько из них поместится за стол этого режима. */
export function pickBots(value: unknown, mode: TurboMode): number {
  const asked =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(asked) || asked <= 0) return 0;

  return Math.min(Math.trunc(asked), botRoom(mode));
}

/** Уровень из формы; незнакомое значение — «Нормальный», а не падение. */
export function pickLevel(value: unknown): LevelId {
  return LEVEL_IDS.includes(value as LevelId) ? (value as LevelId) : "normal";
}

/**
 * Сколько миллисекунд даётся на ход. `null` — без ограничения: платформа в
 * этом случае будильник не заводит вовсе.
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

const TIME_CONTROLS = Object.keys(MOVE_LIMIT_MS) as TimeControl[];

/**
 * Первый режим каталога — с него начинается и сама разработка, — ферзи, как
 * первые в его постановке, и полминуты на ход, как в общем зале шахмат.
 */
export function defaultRoomSettings(): TurboRoomSettings {
  return {
    mode: "ONE_KIND",
    timeControl: "SEC_30",
    options: { kind: "q" },
    bots: 0,
    botLevel: "normal",
  };
}

/**
 * Разобрать то, что пришло из формы. Значения приходят от клиента, поэтому
 * режим и время сверяются со списком, а не приводятся типом, а ручки читает
 * сам режим — только свои (modes/rules.ts). Всё, что клиент пришлёт сверх
 * положенного, выбрасывается.
 */
export function normalizeRoomSettings(raw: {
  mode: unknown;
  timeControl: unknown;
  /** Поле формы по имени. Нет формы — нет и ручек. */
  field?: (name: string) => unknown;
  /** Сколько мест отдать программе. */
  bots?: unknown;
  /** Уровень этих программ. */
  botLevel?: unknown;
}): TurboRoomSettings {
  const fallback = defaultRoomSettings();
  const mode = pickMode(raw.mode);

  return {
    mode,
    timeControl: TIME_CONTROLS.includes(raw.timeControl as TimeControl)
      ? (raw.timeControl as TimeControl)
      : fallback.timeControl,
    options: modeOptions(mode, raw.field ?? (() => undefined)),
    bots: pickBots(raw.bots, mode),
    botLevel: pickLevel(raw.botLevel),
  };
}

/**
 * Разобрать ручки, прочитанные из базы. Там лежит то, что туда когда-то
 * записали, — форма могла с тех пор измениться, поэтому берутся только простые
 * значения, а всё прочее тихо отбрасывается.
 */
export function readOptions(raw: unknown): ModeOptions {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};

  const options: ModeOptions = {};
  for (const [key, value] of Object.entries(raw)) {
    if (
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      options[key] = value;
    }
  }
  return options;
}

/**
 * Режим из формы. Сверяется со списком тех, что видят игроки: служебную
 * «Классику» формой не выбрать, даже если прислать её руками.
 */
export function pickMode(value: unknown): TurboMode {
  const found = PLAYER_MODES.find((mode) => mode.id === value);
  return found ? found.id : defaultRoomSettings().mode;
}

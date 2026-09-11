import { MODE_IDS, type TurboMode } from "../modes/catalog";

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
 * (prisma/schema/turbochess.prisma). Пока ни у одного режима ручек нет:
 * настройки каждого согласуются в начале его этапа (docs/MODES.md).
 */
export type ModeOptions = Record<string, string | number | boolean>;

export interface TurboRoomSettings {
  mode: TurboMode;
  options: ModeOptions;
}

/** Первый режим каталога: с него начинается и сама разработка (этап 6). */
export function defaultRoomSettings(): TurboRoomSettings {
  return { mode: "ONE_KIND", options: {} };
}

/**
 * Разобрать то, что пришло из формы. Значения приходят от клиента, поэтому
 * режим сверяется со списком, а не приводится типом.
 *
 * Ручки из формы пока не читаются вовсе: их ещё нет ни у одного режима, и
 * всё, что клиент пришлёт сверх режима, выбрасывается.
 */
export function normalizeRoomSettings(raw: {
  mode: unknown;
}): TurboRoomSettings {
  return { mode: pickMode(raw.mode), options: {} };
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

export function pickMode(value: unknown): TurboMode {
  return MODE_IDS.includes(value as TurboMode)
    ? (value as TurboMode)
    : defaultRoomSettings().mode;
}

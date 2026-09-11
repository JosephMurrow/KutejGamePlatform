import { classicPosition, type Position } from "../engine/position";
import type { ModeOptions } from "../rooms/settings";
import { modeInfo, type TurboMode } from "./catalog";
import {
  ONE_KIND_LABEL,
  oneKindOf,
  oneKindOptions,
  oneKindPosition,
  oneKindRules,
} from "./oneKind";

/**
 * Каркас режимов: чем режим отличается от обычных шахмат.
 *
 * Комната спрашивает здесь начальную позицию, форма — ручки, экран — правила
 * для игрока. Движок про режимы не знает ничего: режим встаёт в него через
 * позицию, а на следующих этапах — через точки расширения из docs/SPEC.md,
 * раздел 11.
 *
 * Код без серверных зависимостей: правила читает и браузер.
 */

/**
 * Режимы, у которых свои правила уже работают. Остальные пока играют
 * обычные шахматы, и экран комнаты говорит об этом прямо.
 */
const READY: ReadonlySet<TurboMode> = new Set(["CLASSIC", "ONE_KIND"]);

export function isReady(mode: TurboMode): boolean {
  return READY.has(mode);
}

/** Начальная позиция партии в этом режиме. */
export function startPosition(mode: TurboMode, options: ModeOptions): Position {
  switch (mode) {
    case "ONE_KIND":
      return oneKindPosition(oneKindOf(options));
    default:
      return classicPosition();
  }
}

/**
 * Ручки режима из формы. У режимов без ручек — пусто: всё, что клиент пришлёт
 * сверх положенного, выбрасывается.
 */
export function modeOptions(
  mode: TurboMode,
  read: (name: string) => unknown,
): ModeOptions {
  switch (mode) {
    case "ONE_KIND":
      return oneKindOptions(read);
    default:
      return {};
  }
}

export interface ModeRules {
  /** Какой вариант режима выбран — «все — ферзи»; `null` — у режима их нет. */
  variant: string | null;
  /** Правила для игрока, по абзацу. */
  lines: string[];
  /** Свои правила режима уже работают. */
  ready: boolean;
}

/** Правила для игрока — на карточке перед стартом и по кнопке у доски. */
export function rulesOf(mode: TurboMode, options: ModeOptions): ModeRules {
  switch (mode) {
    case "CLASSIC":
      return { variant: null, lines: ["Обычные шахматы."], ready: true };
    case "ONE_KIND":
      return {
        variant: `все — ${ONE_KIND_LABEL[oneKindOf(options)]}`,
        lines: oneKindRules(options),
        ready: true,
      };
    default:
      return {
        variant: null,
        lines: [
          modeInfo(mode).short,
          "Свои правила этого режима встанут на его этапе. Пока играем обычные шахматы.",
        ],
        ready: false,
      };
  }
}

import type { Side } from "../engine/pieces";
import type { Position } from "../engine/position";
import type { ModeOptions } from "../rooms/settings";
import { PIECE_VALUE, pointsOf } from "./points";

/**
 * Режим 8, «Ядерные шахматы» (docs/MODES.md): шахматы обычные, но за взятые
 * фигуры идут очки, и набравший порог может сбросить бомбу — партия сразу
 * кончается его победой.
 *
 * Правила ходов не меняются ни в чём, поэтому позиция здесь обычная: бомба —
 * не ход, а отдельное действие комнаты (server/room.ts). Очки считаются по
 * взятым фигурам, а они лежат в позиции, так что своя шкала есть и у клиента.
 */

export { PIECE_VALUE };

/**
 * Пороги заряда. Всего у стороны 39 очков материала: 25 — это примерно ферзь,
 * две ладьи и конь, дорого, но достижимо, и не раньше середины партии.
 */
export const NUCLEAR_THRESHOLDS: readonly number[] = [20, 25, 30];

/** Имя поля формы, в котором приходит порог. */
export const NUCLEAR_FIELD = "threshold";

const DEFAULT_THRESHOLD = 25;

/**
 * Порог из ручек режима. Ручки лежат в базе JSON и приходят из формы, так что
 * порог сверяется со списком; всё прочее — умолчание.
 */
export function nuclearThreshold(options: ModeOptions): number {
  const value = Number(options.threshold);
  return NUCLEAR_THRESHOLDS.includes(value) ? value : DEFAULT_THRESHOLD;
}

/** Ручки режима из формы. */
export function nuclearOptions(read: (name: string) => unknown): ModeOptions {
  return {
    threshold: nuclearThreshold({ threshold: Number(read(NUCLEAR_FIELD)) }),
  };
}

/** Заряд стороны: те же очки, что и у рынка, — общая шкала номиналов. */
export function nuclearCharge(position: Position, side: Side): number {
  return pointsOf(position, side);
}

/** Заряд набран — бомбу можно сбрасывать. */
export function bombReady(
  position: Position,
  options: ModeOptions,
  side: Side,
): boolean {
  return nuclearCharge(position, side) >= nuclearThreshold(options);
}

/** Правила для игрока — на карточке перед стартом и по кнопке у доски. */
export function nuclearRules(options: ModeOptions): string[] {
  return [
    "Шахматы обычные: шах, мат, рокировка — всё на месте.",
    "За взятые фигуры идут очки: пешка — 1, конь и слон — 3, ладья — 5, ферзь — 9.",
    `Набрал ${nuclearThreshold(options)} очков — в свой ход, вместо хода, можешь сбросить бомбу и закончить партию победой.`,
    "Свою шкалу заряда видишь только ты: соперник не знает, заряжена ли бомба.",
    "Либо ты умный и ставишь мат, либо кровожадный и режешь всё подряд ради бомбы.",
  ];
}

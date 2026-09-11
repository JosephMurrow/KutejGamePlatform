import type { PieceKind, Side } from "../engine/pieces";
import type { Position } from "../engine/position";
import type { ModeOptions } from "../rooms/settings";

/**
 * Режим 8, «Ядерные шахматы» (docs/MODES.md): шахматы обычные, но за взятые
 * фигуры идут очки, и набравший порог может сбросить бомбу — партия сразу
 * кончается его победой.
 *
 * Правила ходов не меняются ни в чём, поэтому позиция здесь обычная: бомба —
 * не ход, а отдельное действие комнаты (server/room.ts). Очки считаются по
 * взятым фигурам, а они лежат в позиции, так что своя шкала есть и у клиента.
 */

/**
 * Номиналы фигур — общая шкала игры (docs/MODES.md, «Общее для всех
 * режимов»). Короля в обычных шахматах не берут, очков за него не бывает.
 */
export const PIECE_VALUE: Record<PieceKind, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

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

/** Заряд стороны: сумма номиналов всего, что она съела у соперника. */
export function nuclearCharge(position: Position, side: Side): number {
  return (position.taken[side] ?? []).reduce(
    (total, taken) => total + (PIECE_VALUE[taken.kind] ?? 0),
    0,
  );
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

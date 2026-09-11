import type { Vec } from "./geometry";

/**
 * Фигуры и то, как они ходят.
 *
 * Как ходит фигура, задано таблицей, а не кодом: прыжки на один вектор и лучи
 * до первой преграды. На таблице и держатся будущие режимы — мега-конь
 * получает лишний прыжок, амазонка — ход конём, пацанские фигуры теряют
 * направления назад (docs/BACKLOG.md B4). Генератор ходов про режимы не знает.
 *
 * Пешки в таблице нет: у неё ход, взятие, двойной шаг, превращение и взятие на
 * проходе — пять разных правил, и зависят они от того, куда смотрит сторона.
 */

/** Пешка, конь, слон, ладья, ферзь, король — буквами, как в записи партии. */
export type PieceKind = "p" | "n" | "b" | "r" | "q" | "k";

/**
 * Сторона — номер места за столом. У двоих это белые (0) и чёрные (1), в
 * королевской битве сторон четыре (docs/MODES.md, режим 9).
 */
export type Side = number;

export interface Piece {
  readonly kind: PieceKind;
  readonly side: Side;
}

/** Как ходит фигура: прыжки на один вектор и лучи до первой преграды. */
export interface Pattern {
  readonly leaps: readonly Vec[];
  readonly slides: readonly Vec[];
}

const ORTHOGONAL: readonly Vec[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAGONAL: readonly Vec[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const KNIGHT: readonly Vec[] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

export const PATTERNS: Readonly<Record<Exclude<PieceKind, "p">, Pattern>> = {
  n: { leaps: KNIGHT, slides: [] },
  b: { leaps: [], slides: DIAGONAL },
  r: { leaps: [], slides: ORTHOGONAL },
  q: { leaps: [], slides: [...ORTHOGONAL, ...DIAGONAL] },
  k: { leaps: [...ORTHOGONAL, ...DIAGONAL], slides: [] },
};

/** Во что превращается пешка. */
export const PROMOTIONS: readonly PieceKind[] = ["q", "r", "b", "n"];

const CACHE = new Map<string, Piece>();

/**
 * Фигура этого вида и этой стороны. Один объект на пару: позиции делят
 * фигуры между собой, и менять фигуру на месте нельзя — превращение ставит
 * новую.
 */
export function piece(kind: PieceKind, side: Side): Piece {
  const key = `${kind}${side}`;
  let found = CACHE.get(key);
  if (!found) {
    found = Object.freeze({ kind, side });
    CACHE.set(key, found);
  }
  return found;
}

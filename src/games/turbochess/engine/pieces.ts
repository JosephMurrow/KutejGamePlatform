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

/**
 * Метки фигуры сверх вида и стороны — их ставят режимы, и ездят они вместе с
 * фигурой: мега-форма остаётся мега-формой, куда бы фигура ни пошла.
 */
export interface PieceMarks {
  /** Мега-форма: фигура дошла до первой горизонтали соперника (режим 4). */
  readonly mega?: boolean;
  /** Двойной агент: ею ходит и соперник (режим 10). */
  readonly agent?: boolean;
  /** Агент пробуждён: соперник им сходил, и теперь его видят все. */
  readonly awake?: boolean;
  /**
   * Щит чёрного рынка: фигура переживает одно взятие, рубящий возвращается
   * назад (docs/MODES.md, режим 13).
   */
  readonly shield?: boolean;
}

export interface Piece extends PieceMarks {
  readonly kind: PieceKind;
  readonly side: Side;
}

/**
 * Как ходит фигура: прыжки на один вектор, лучи до первой преграды и лучи с
 * правом перепрыгнуть ровно одну фигуру — это пушка мега-шахмат.
 */
export interface Pattern {
  readonly leaps: readonly Vec[];
  readonly slides: readonly Vec[];
  readonly hops?: readonly Vec[];
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

/** Большая буква Г — прыжок мега-коня (docs/MODES.md, режим 4). */
const BIG_KNIGHT: readonly Vec[] = [
  [2, 3],
  [3, 2],
  [3, -2],
  [2, -3],
  [-2, -3],
  [-3, -2],
  [-3, 2],
  [-2, 3],
];

export const PATTERNS: Readonly<Record<Exclude<PieceKind, "p">, Pattern>> = {
  n: { leaps: KNIGHT, slides: [] },
  b: { leaps: [], slides: DIAGONAL },
  r: { leaps: [], slides: ORTHOGONAL },
  q: { leaps: [], slides: [...ORTHOGONAL, ...DIAGONAL] },
  k: { leaps: [...ORTHOGONAL, ...DIAGONAL], slides: [] },
};

/**
 * Мега-формы: что фигура получает, дойдя до первой горизонтали соперника
 * (docs/MODES.md, режим 4). Король мега-формы не получает — дойдя, он просто
 * выигрывает, и это правило партии, а не таблица ходов.
 */
export const MEGA_PATTERNS: Readonly<Record<Exclude<PieceKind, "p">, Pattern>> =
  {
    n: { leaps: [...KNIGHT, ...BIG_KNIGHT], slides: [] },
    b: { leaps: ORTHOGONAL, slides: DIAGONAL },
    r: { leaps: [], slides: ORTHOGONAL, hops: ORTHOGONAL },
    q: { leaps: KNIGHT, slides: [...ORTHOGONAL, ...DIAGONAL] },
    k: PATTERNS.k,
  };

/** Как ходит эта фигура: по обычной таблице или по мега-форме. */
export function patternOf(mover: Piece): Pattern {
  if (mover.kind === "p") return { leaps: [], slides: [] };
  return mover.mega ? MEGA_PATTERNS[mover.kind] : PATTERNS[mover.kind];
}

/** Во что превращается пешка. */
export const PROMOTIONS: readonly PieceKind[] = ["q", "r", "b", "n"];

const CACHE = new Map<string, Piece>();

/** Метки строкой — ими фигуры различаются в кэше и в ключе повторений. */
export function markKey(marks: PieceMarks): string {
  return `${marks.mega ? "m" : ""}${marks.agent ? "a" : ""}${marks.awake ? "w" : ""}${marks.shield ? "s" : ""}`;
}

/**
 * Фигура этого вида, этой стороны и с этими метками. Один объект на набор:
 * позиции делят фигуры между собой, и менять фигуру на месте нельзя —
 * превращение и мега-форма ставят новую.
 */
export function piece(
  kind: PieceKind,
  side: Side,
  marks: PieceMarks = {},
): Piece {
  const key = `${kind}${side}${markKey(marks)}`;
  let found = CACHE.get(key);
  if (!found) {
    found = Object.freeze({
      kind,
      side,
      ...(marks.mega ? { mega: true } : {}),
      ...(marks.agent ? { agent: true } : {}),
      ...(marks.awake ? { awake: true } : {}),
      ...(marks.shield ? { shield: true } : {}),
    });
    CACHE.set(key, found);
  }
  return found;
}

/** Та же фигура без этой метки: щит сгорает, когда его пробили. */
export function unmarked(mover: Piece, mark: keyof PieceMarks): Piece {
  const marks: PieceMarks = {
    mega: mover.mega,
    agent: mover.agent,
    awake: mover.awake,
    shield: mover.shield,
  };

  return piece(mover.kind, mover.side, { ...marks, [mark]: false });
}

/** Та же фигура с добавленными метками. */
export function marked(mover: Piece, marks: PieceMarks): Piece {
  return piece(mover.kind, mover.side, {
    mega: mover.mega || marks.mega,
    agent: mover.agent || marks.agent,
    awake: mover.awake || marks.awake,
    shield: mover.shield || marks.shield,
  });
}

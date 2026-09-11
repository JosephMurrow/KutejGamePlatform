/**
 * Фигуры турбо-шахмат: нарезаны из листа, который прислал хозяин
 * (scripts/cut-pieces.py). Файлы лежат в `public/games/turbochess/pieces`,
 * по одному на вид и цвет: `wp.webp` — светлая пешка, `bk.webp` — тёмный король.
 *
 * Доски пока нет — она придёт на этапе 4 (docs/PLAN.md), и тогда здесь же
 * встанет набор отрисовщиков для неё. До тех пор фигуры показывает главная.
 */

export const PIECE_KINDS = ["p", "n", "b", "r", "q", "k"] as const;

export type PieceKind = (typeof PIECE_KINDS)[number];

/** Светлые и тёмные — так они подписаны на листе хозяина. */
export type PieceColor = "w" | "b";

export const PIECE_NAME: Record<PieceKind, string> = {
  p: "Пешка",
  n: "Конь",
  b: "Слон",
  r: "Ладья",
  q: "Ферзь",
  k: "Король",
};

const DIR = "/games/turbochess/pieces";

/** Адрес картинки фигуры в `public`. */
export function pieceSrc(color: PieceColor, kind: PieceKind): string {
  return `${DIR}/${color}${kind}.webp`;
}

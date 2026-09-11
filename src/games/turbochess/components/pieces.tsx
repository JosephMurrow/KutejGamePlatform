import type { PieceRenderObject } from "react-chessboard";
import type { PieceKind } from "../engine/pieces";

/**
 * Фигуры турбо-шахмат: нарезаны из листа, который прислал хозяин
 * (scripts/cut-pieces.py). Файлы лежат в `public/games/turbochess/pieces`,
 * по одному на вид и цвет: `wp.webp` — светлая пешка, `bk.webp` — тёмный король.
 *
 * Отсюда их берут главная (состав) и доска. Доске нужны отрисовщики по ключу
 * вида `wP` — так библиотека доски зовёт фигуры у себя.
 */

export const PIECE_KINDS: readonly PieceKind[] = ["p", "n", "b", "r", "q", "k"];

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

/**
 * Цвет фигуры по стороне. Сторон пока две; в королевской битве их четыре, и
 * рисунков для третьей и четвёртой ещё нет (docs/MODES.md, режим 9).
 */
export function colorOf(side: number): PieceColor {
  return side === 0 ? "w" : "b";
}

function render(color: PieceColor, kind: PieceKind) {
  return function Piece() {
    return (
      // Правило зовёт `next/image`, но файлы уже нужного размера, а размер
      // клетки задаёт доска — оптимизатору тут нечего делать. Так же сделано
      // у фигур шахмат и у платформенного аватара.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={pieceSrc(color, kind)}
        alt=""
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    );
  };
}

/** Отрисовщики для доски: ключ `wP` — светлая пешка, `bK` — тёмный король. */
export const PIECES: PieceRenderObject = Object.fromEntries(
  (["w", "b"] as const).flatMap((color) =>
    PIECE_KINDS.map((kind) => [
      `${color}${kind.toUpperCase()}`,
      render(color, kind),
    ]),
  ),
);

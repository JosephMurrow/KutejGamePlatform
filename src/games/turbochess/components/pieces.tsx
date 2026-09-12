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
 * Цвет фигуры по стороне. Рисунков два набора, а в королевской битве сторон
 * четыре: юг и запад играют светлыми, север и восток — тёмными, а различает
 * их кольцо стороны на клетке (components/Board.tsx).
 */
export function colorOf(side: number, sides = 2): PieceColor {
  if (sides > 2) return side <= 1 ? "w" : "b";

  return side === 0 ? "w" : "b";
}

/**
 * Кольцо стороны в королевской битве: им отличаются те, кому достался один
 * набор фигур. Цвета — из палитры игры, новых не заводим.
 */
export const SIDE_RING: Readonly<Record<number, string>> = {
  1: "#ffe14a",
  3: "#ff7a3d",
};

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

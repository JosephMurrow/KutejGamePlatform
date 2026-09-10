import type { PieceRenderObject } from "react-chessboard";

/**
 * Фигуры на доске: те, что нарезаны из присланного листа.
 *
 * Библиотека ждёт по функции на каждую фигуру и зовёт их своим ключом вида
 * `wP`; наши файлы названы строчным `wp.png` — отсюда приведение регистра.
 *
 * Набор из коробки у библиотеки MIT, и его можно было бы взять, но мрамор с
 * золотом попадает в тему игры, а нарисованные линии — нет
 * (src/games/chess/docs/BACKLOG.md B2).
 *
 * Обычный `<img>`, а не `next/image`: файлы лежат в `public` уже нужного
 * размера, а размер клетки задаёт доска — оптимизатору тут нечего делать.
 * Так же сделано у платформенного аватара.
 */

const KINDS = ["P", "N", "B", "R", "Q", "K"] as const;
const DIR = "/games/chess/pieces";

function render(key: string) {
  return function Piece() {
    return (
      // Правило зовёт `next/image`; причина, почему здесь его нет, — выше.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`${DIR}/${key.toLowerCase()}.png`}
        alt=""
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    );
  };
}

export const PIECES: PieceRenderObject = Object.fromEntries(
  (["w", "b"] as const).flatMap((color) =>
    KINDS.map((kind) => [`${color}${kind}`, render(`${color}${kind}`)]),
  ),
);

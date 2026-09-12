import { CLASSIC, squareAt } from "../engine/geometry";
import { piece, type Piece, type Side } from "../engine/pieces";
import {
  CLASSIC_RULES,
  TWO_SIDES,
  castlingFor,
  type Position,
} from "../engine/position";
import type { ModeOptions } from "../rooms/settings";

/**
 * Режим 1, «Одним видом фигур» (docs/MODES.md): все фигуры, кроме короля, —
 * одного вида. Правила ходов обычные, особая только расстановка — поэтому с
 * него и начинаются режимы: он доказывает, что режим встаёт в движок, не
 * переписывая его.
 */

export type OneKind = "q" | "r" | "b" | "n" | "p";

/** Порядок — как в постановке: ферзи, ладьи, кони, пешки, и слоны к ним. */
export const ONE_KINDS: readonly OneKind[] = ["q", "r", "n", "b", "p"];

/** Как вид называется во множественном числе — «все — ферзи». */
export const ONE_KIND_LABEL: Record<OneKind, string> = {
  q: "ферзи",
  r: "ладьи",
  n: "кони",
  b: "слоны",
  p: "пешки",
};

/** Имя поля формы, в котором приходит вид. */
export const ONE_KIND_FIELD = "oneKind";

/**
 * Вид из ручек режима. Ручки лежат в базе JSON и приходят из формы, так что
 * вид сверяется со списком; всё прочее — ферзи, первый в постановке.
 */
export function oneKindOf(options: ModeOptions): OneKind {
  const kind = options.kind;
  return ONE_KINDS.includes(kind as OneKind) ? (kind as OneKind) : "q";
}

/** Ручки режима из формы. */
export function oneKindOptions(read: (name: string) => unknown): ModeOptions {
  return { kind: oneKindOf({ kind: read(ONE_KIND_FIELD) as string }) };
}

/**
 * Расстановка. Король на своём месте, остальные пятнадцать клеток — выбранным
 * видом.
 *
 * Пешки — исключение: пешки первой горизонтали упёрлись бы в пешки второй и
 * стояли бы запертыми. Поэтому первая горизонталь пуста, кроме короля, вторая
 * занята целиком, на третьей — семь пешек и пустая клетка на вертикали
 * короля: пешка перед королём может пойти сразу, и королю будет куда выйти.
 */
export function oneKindPosition(kind: OneKind): Position {
  const geometry = CLASSIC;
  const board: (Piece | null)[] = Array.from(
    { length: geometry.width * geometry.height },
    () => null,
  );

  for (const side of [0, 1] as Side[]) {
    const back = side === 0 ? 0 : geometry.height - 1;
    const step = side === 0 ? 1 : -1;
    const put = (x: number, line: number, cell: Piece) => {
      board[squareAt(geometry, x, back + step * line)] = cell;
    };

    put(4, 0, piece("k", side));
    for (let x = 0; x < geometry.width; x++) {
      if (kind === "p") {
        put(x, 1, piece("p", side));
        if (x !== 4) put(x, 2, piece("p", side));
      } else {
        if (x !== 4) put(x, 0, piece(kind, side));
        put(x, 1, piece(kind, side));
      }
    }
  }

  return {
    geometry,
    sides: TWO_SIDES,
    rules: CLASSIC_RULES,
    board,
    turn: 0,
    castling: castlingFor(geometry, board),
    enPassant: null,
    quiet: 0,
    sinceCapture: 0,
    taken: [[], []],
    reserve: [[], []],
    pending: [],
    chances: [],
    vetoes: [],
    banned: null,
  };
}

/** Правила для игрока — на карточке перед стартом и по кнопке у доски. */
export function oneKindRules(options: ModeOptions): string[] {
  const kind = oneKindOf(options);
  const lines = [
    `Все фигуры обеих сторон, кроме короля, — ${ONE_KIND_LABEL[kind]}. Король один и остаётся королём, побеждает мат.`,
    "Ходят фигуры как обычно — меняется только то, чем приходится играть.",
  ];

  if (kind === "p") {
    lines.push(
      "Пешки стоят на второй и третьей горизонталях, первая пуста — кроме короля. Перед королём оставлена клетка, чтобы ему было куда выйти.",
    );
  }
  if (kind === "q") {
    lines.push("Пятнадцать ферзей с каждой стороны. Да, это законно.");
  }
  if (kind === "r") {
    lines.push(
      "Ладьи в углах на месте, так что рокировка есть — как только освободится дорога.",
    );
  }

  return lines;
}

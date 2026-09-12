import { squareAt, type Geometry } from "../engine/geometry";
import { piece, type Piece, type PieceKind, type Side } from "../engine/pieces";
import {
  CLASSIC_RULES,
  FOUR_SIDES,
  type CastleRight,
  type Position,
} from "../engine/position";

/**
 * Режим 9, «Королевская битва» (docs/MODES.md): доска 16×16, четыре игрока по
 * краям, все против всех.
 *
 * Своего у режима — доска, расстановка и цель партии: заматованный выбывает и
 * уносит фигуры, побеждает последний оставшийся. Ходы обычные, и генератор
 * ради этого не менялся: размер доски и число сторон в нём были параметрами с
 * третьего этапа.
 */

/** Доска королевской битвы. */
export const BATTLE_BOARD: Geometry = { width: 16, height: 16 };

/** Кто где сидит. Порядок — по часовой, он же порядок хода. */
export const BATTLE_SIDE_NAME = ["юг", "запад", "север", "восток"] as const;

/** Восемь фигур у кромки — те же, что у обычных шахмат. */
const EDGE: readonly PieceKind[] = ["r", "n", "b", "q", "k", "b", "n", "r"];

/** С какой клетки начинается восьмёрка: середина края, углы 4×4 пустые. */
const FIRST = 4;

/**
 * Клетки края стороны: сначала кромка, потом линия пешек перед ней.
 *
 * Юг и север стоят вдоль горизонталей, запад и восток — вдоль вертикалей, и
 * считается это одинаково: край берётся из направления пешек стороны.
 */
function edgeSquares(
  side: Side,
  line: 0 | 1,
): { square: number; index: number }[] {
  const geometry = BATTLE_BOARD;
  const forward = FOUR_SIDES[side]?.forward ?? [0, 1];
  const along = forward[0] !== 0;
  const size = along ? geometry.width : geometry.height;
  const back = (along ? forward[0] : forward[1]) > 0 ? line : size - 1 - line;

  return EDGE.map((_, index) => {
    const at = FIRST + index;
    return {
      index,
      square: along
        ? squareAt(geometry, back, at)
        : squareAt(geometry, at, back),
    };
  });
}

/**
 * Права рокировки битвы: король с ладьями своего края, король уходит на две
 * клетки, ладья встаёт рядом. Правило то же, что у обычных шахмат, — меняется
 * только то, вдоль чего стоит край.
 */
function battleCastling(): CastleRight[] {
  return FOUR_SIDES.flatMap((_, side) => {
    const edge = edgeSquares(side, 0);
    const king = edge[4]?.square;
    const near = edge[7]?.square;
    const far = edge[0]?.square;
    const step = (edge[5]?.square ?? 0) - (king ?? 0);
    if (king === undefined || near === undefined || far === undefined)
      return [];

    return [
      { side, king, rook: near, kingTo: king + 2 * step, rookTo: king + step },
      { side, king, rook: far, kingTo: king - 2 * step, rookTo: king - step },
    ];
  });
}

export function battlePosition(): Position {
  const geometry = BATTLE_BOARD;
  const board: (Piece | null)[] = Array.from(
    { length: geometry.width * geometry.height },
    () => null,
  );

  FOUR_SIDES.forEach((_, side) => {
    for (const { square, index } of edgeSquares(side, 0)) {
      board[square] = piece(EDGE[index] ?? "p", side);
    }
    for (const { square } of edgeSquares(side, 1)) {
      board[square] = piece("p", side);
    }
  });

  return {
    geometry,
    sides: FOUR_SIDES,
    rules: { ...CLASSIC_RULES, goal: "battle" },
    board,
    turn: 0,
    castling: battleCastling(),
    enPassant: null,
    quiet: 0,
    sinceCapture: 0,
    taken: [[], [], [], []],
    reserve: [[], [], [], []],
    pending: [],
    chances: [],
    vetoes: [],
    spent: [],
    extra: [],
    banned: null,
  };
}

/** Правила для игрока — на карточке перед стартом и по кнопке у доски. */
export function battleRules(): string[] {
  return [
    "Доска 16×16, четверо по краям, все против всех. Ходы обычные, порядок хода — по часовой: юг, запад, север, восток.",
    "Заматованный выбывает, и его фигуры исчезают с доски. Побеждает последний оставшийся.",
    "Пешка идёт от своего края к противоположному и превращается на дальнем краю — путь длинный, так что превращение здесь редкость.",
    "Заперли без шаха — пропускаете ход и ждёте: соседи сдвинут фигуры, и ход вернётся.",
    "Ушедший из-за стола выбывает через полторы минуты, как при мате. Между сторонами двенадцать пустых рядов — это место для манёвра, а не пустота.",
  ];
}

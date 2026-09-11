import { CLASSIC, squareAt, type Geometry, type Vec } from "./geometry";
import { piece, type Piece, type PieceKind, type Side } from "./pieces";

/**
 * Позиция — всё, что нужно правилам, чтобы решить, какие ходы есть.
 *
 * FEN тут не годится: он не описывает ни доску 16×16, ни четыре стороны, ни
 * резерв, ни мега-фигуры (docs/BACKLOG.md B2). Поэтому позиция — объект, и он
 * неизменяемый: ход даёт новую позицию, а старая остаётся, какой была. На
 * этом держится и ход назад, и перебор ботов, и запись партии.
 */

/** Что правила знают о стороне, кроме её фигур. */
export interface SideRules {
  /** Куда ходят пешки: у белых вверх, у чёрных вниз. */
  readonly forward: Vec;
}

/**
 * Чем кончается партия. Отсюда же следует, королевский ли король: где цель не
 * мат, он обычная фигура, которую бьют.
 */
export type Goal =
  /** Обычная цель — мат. */
  | "mate"
  /** Снять с доски все фигуры соперника (docs/MODES.md, режим 3). */
  | "wipe"
  /** Скормить сопернику своего короля (docs/MODES.md, режим 11). */
  | "feed";

/**
 * Правила режима, которые нужны самой доске.
 *
 * Лежат в позиции, а не в комнате, потому что законные ходы считает и клиент:
 * доска подсказывает ходы тем же `legalMoves` по позиции из снимка
 * (components/Board.tsx). Положи правило мимо позиции — и клиент подсветит не
 * то, что примет сервер.
 */
export interface PositionRules {
  readonly goal: Goal;
  /** Есть чем взять — брать обязательно, как в шашках. */
  readonly mustCapture: boolean;
}

/** Правила обычных шахмат: мат и взятие по желанию. */
export const CLASSIC_RULES: PositionRules = {
  goal: "mate",
  mustCapture: false,
};

/**
 * Сколько полуходов без взятия останавливают партию там, где цель — снять всё.
 * Без этого две уцелевшие фигуры бегали бы друг от друга вечно.
 */
export const STALL_PLIES = 50;

/**
 * Король королевский: ходить под шах нельзя, из-под шаха обязан выйти, мат
 * кончает партию. Где цель другая, шаха нет как понятия — ни в отсеве ходов,
 * ни в записи, ни в подсветке.
 */
export function kingIsRoyal(position: Position): boolean {
  return position.rules.goal === "mate";
}

/**
 * Право рокировки: какой король с какой ладьёй и куда они встают.
 *
 * Клетками, а не буквами `KQkq`: так рокировка не привязана ни к углам доски
 * 8×8, ни к двум сторонам.
 */
export interface CastleRight {
  readonly side: Side;
  readonly king: number;
  readonly rook: number;
  readonly kingTo: number;
  readonly rookTo: number;
}

/** Пешка только что прошла на два поля — её можно взять на проходе. */
export interface EnPassant {
  /** Поле, через которое она прошла: туда и бьют. */
  readonly target: number;
  /** Где она стоит. */
  readonly victim: number;
}

export interface Position {
  readonly geometry: Geometry;
  readonly sides: readonly SideRules[];
  /** Правила режима, которые нужны доске: цель партии и обязательное взятие. */
  readonly rules: PositionRules;
  readonly board: readonly (Piece | null)[];
  readonly turn: Side;
  readonly castling: readonly CastleRight[];
  readonly enPassant: EnPassant | null;
  /**
   * Полуходы без взятий и ходов пешкой — по ним правила пятидесяти и
   * семидесяти пяти ходов.
   */
  readonly quiet: number;
  /**
   * Полуходы без взятий — по ним останавливается партия там, где цель снять
   * все фигуры. Не то же, что `quiet`: тот сбрасывается и ходом пешки.
   */
  readonly sinceCapture: number;
  /**
   * Что забрала каждая сторона, по порядку. По этому списку доска рисует
   * взятые фигуры, а режимы считают убийства, очки и резерв
   * (docs/MODES.md, режимы 3, 8, 13, 14).
   */
  readonly taken: readonly (readonly Piece[])[];
}

/** Белые ходят вверх, чёрные вниз. */
export const TWO_SIDES: readonly SideRules[] = [
  { forward: [0, 1] },
  { forward: [0, -1] },
];

const BACK_RANK: readonly PieceKind[] = [
  "r",
  "n",
  "b",
  "q",
  "k",
  "b",
  "n",
  "r",
];

/** Обычная начальная расстановка. */
export function classicPosition(): Position {
  const geometry = CLASSIC;
  const board: (Piece | null)[] = Array.from(
    { length: geometry.width * geometry.height },
    () => null,
  );

  BACK_RANK.forEach((kind, x) => {
    board[squareAt(geometry, x, 0)] = piece(kind, 0);
    board[squareAt(geometry, x, 1)] = piece("p", 0);
    board[squareAt(geometry, x, 6)] = piece("p", 1);
    board[squareAt(geometry, x, 7)] = piece(kind, 1);
  });

  return {
    geometry,
    sides: TWO_SIDES,
    rules: CLASSIC_RULES,
    board,
    turn: 0,
    castling: classicCastling(geometry, [0, 1]),
    enPassant: null,
    quiet: 0,
    sinceCapture: 0,
    taken: [[], []],
  };
}

/**
 * Обычные права рокировки: король с вертикали `e`, ладьи в углах, король
 * встаёт на `g` или `c`, ладья — рядом с ним.
 */
export function classicCastling(
  geometry: Geometry,
  sides: readonly Side[],
): CastleRight[] {
  return sides.flatMap((side) => {
    const y = side === 0 ? 0 : geometry.height - 1;
    const at = (x: number) => squareAt(geometry, x, y);

    return [
      { side, king: at(4), rook: at(7), kingTo: at(6), rookTo: at(5) },
      { side, king: at(4), rook: at(0), kingTo: at(2), rookTo: at(3) },
    ];
  });
}

/**
 * Права рокировки для расстановки: обычные права, но только там, где король и
 * ладья и правда стоят на своих местах. Одновидовые шахматы без ладей в углах
 * рокировки не имеют — так же, как её не даёт FEN без букв `KQkq`.
 */
export function castlingFor(
  geometry: Geometry,
  board: readonly (Piece | null)[],
): CastleRight[] {
  return classicCastling(geometry, [0, 1]).filter((right) => {
    const king = board[right.king];
    const rook = board[right.rook];
    return (
      king?.kind === "k" &&
      king.side === right.side &&
      rook?.kind === "r" &&
      rook.side === right.side
    );
  });
}

/** Чья очередь после этой стороны. */
export function nextSide(position: Position, side: Side): Side {
  return (side + 1) % position.sides.length;
}

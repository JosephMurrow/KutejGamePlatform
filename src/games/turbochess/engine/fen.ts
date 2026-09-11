import { CLASSIC, offset, parseSquare, squareAt } from "./geometry";
import { piece, type Piece, type PieceKind } from "./pieces";
import {
  CLASSIC_RULES,
  TWO_SIDES,
  classicCastling,
  type CastleRight,
  type Position,
  type PositionRules,
} from "./position";

/**
 * Позиция из FEN — только для обычной доски на двоих.
 *
 * Для партий FEN не нужен: позиция — объект (position.ts). Нужен он тестам:
 * сверка с `chess.js` и справочные позиции perft записаны именно так, и
 * расставлять их руками значило бы ошибаться в самих проверках. Правила
 * режима FEN не описывает, поэтому они приходят вторым доводом.
 */
export function fromFen(
  fen: string,
  rules: PositionRules = CLASSIC_RULES,
): Position {
  const [placement, turn, rights, passant, quiet] = fen.trim().split(/\s+/);
  const geometry = CLASSIC;
  const rows = (placement ?? "").split("/");
  if (rows.length !== geometry.height) throw new Error(`Кривой FEN: ${fen}`);

  const board: (Piece | null)[] = Array.from(
    { length: geometry.width * geometry.height },
    () => null,
  );
  rows.forEach((row, index) => {
    const y = geometry.height - 1 - index;
    let x = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        x += Number(char);
        continue;
      }
      const kind = char.toLowerCase() as PieceKind;
      if (!"pnbrqk".includes(kind)) throw new Error(`Кривой FEN: ${fen}`);
      board[squareAt(geometry, x, y)] = piece(kind, char === kind ? 1 : 0);
      x++;
    }
    if (x !== geometry.width) throw new Error(`Кривой FEN: ${fen}`);
  });

  const side = turn === "b" ? 1 : 0;

  // Права — только обычные и только там, где король и ладья на своих местах.
  const standard = classicCastling(geometry, [0, 1]);
  const letters: Record<string, CastleRight | undefined> = {
    K: standard[0],
    Q: standard[1],
    k: standard[2],
    q: standard[3],
  };
  const castling = [...(rights === "-" ? "" : (rights ?? ""))]
    .map((letter) => letters[letter])
    .filter((right): right is CastleRight => {
      if (!right) return false;
      const king = board[right.king];
      const rook = board[right.rook];
      return (
        king?.kind === "k" &&
        king.side === right.side &&
        rook?.kind === "r" &&
        rook.side === right.side
      );
    });

  // Пешку на проходе можно взять только у той стороны, что сейчас ходила.
  const target =
    passant && passant !== "-" ? parseSquare(geometry, passant) : null;
  const moved = side === 0 ? 1 : 0;
  const victim =
    target !== null
      ? offset(geometry, target, TWO_SIDES[moved]?.forward ?? [0, 0])
      : null;

  return {
    geometry,
    sides: TWO_SIDES,
    rules,
    board,
    turn: side,
    castling,
    enPassant: target !== null && victim !== null ? { target, victim } : null,
    quiet: Number(quiet ?? 0),
    sinceCapture: 0,
    taken: [[], []],
  };
}

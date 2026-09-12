import { fileOf, parseSquare, rankOf, squareName } from "../engine/geometry";
import { DROP, inCheck, type Move } from "../engine/moves";
import type { Piece, PieceKind } from "../engine/pieces";
import type { Position } from "../engine/position";
import { colorOf } from "./pieces";

/**
 * Что доске показать: перевод позиции движка на язык библиотеки доски и
 * подсветки, посчитанные из законных ходов.
 *
 * Отдельно от компонента намеренно: компоненты юнитами не проверяются
 * (docs/TESTING.md), а здесь логика, в которой легко ошибиться, — какие клетки
 * подсветить и когда спрашивать фигуру превращения.
 */

/** Ключ фигуры у библиотеки доски: `wP` — светлая пешка, `bK` — тёмный король. */
export function pieceType(piece: Piece): string {
  return `${colorOf(piece.side)}${piece.kind.toUpperCase()}`;
}

/** Позиция объектом «клетка → фигура», как её ждёт библиотека доски. */
export function boardPosition(
  position: Position,
): Record<string, { pieceType: string }> {
  const placed: Record<string, { pieceType: string }> = {};

  position.board.forEach((cell, square) => {
    if (cell) {
      placed[squareName(position.geometry, square)] = {
        pieceType: pieceType(cell),
      };
    }
  });

  return placed;
}

/**
 * Клетка короля, которому сейчас шах, — того, чья очередь. `null` — шаха
 * нет. Шах видят все: это не подсказка, а состояние партии.
 */
export function checkedKing(position: Position): string | null {
  if (!inCheck(position, position.turn)) return null;

  const square = position.board.findIndex(
    (cell) => cell?.kind === "k" && cell.side === position.turn,
  );
  return square < 0 ? null : squareName(position.geometry, square);
}

/** Куда можно пойти с этой клетки: клетка → берёт ли ход кого-нибудь. */
export function targetsFrom(
  position: Position,
  legal: readonly Move[],
  from: string,
): Map<string, boolean> {
  const targets = new Map<string, boolean>();

  for (const move of legal) {
    if (move.from === DROP) continue;
    if (squareName(position.geometry, move.from) !== from) continue;
    const to = squareName(position.geometry, move.to);
    targets.set(to, (targets.get(to) ?? false) || move.captured !== null);
  }

  return targets;
}

/**
 * Законные ходы с клетки на клетку. Рокировку можно сделать и королём на свою
 * ладью — так же, как её принимает партия.
 */
export function movesBetween(
  position: Position,
  legal: readonly Move[],
  from: string,
  to: string,
): Move[] {
  const { geometry } = position;

  return legal.filter((move) => {
    if (move.from === DROP) return false;
    if (squareName(geometry, move.from) !== from) return false;
    if (squareName(geometry, move.to) === to) return true;
    return (
      move.castle !== null && squareName(geometry, move.castle.rook) === to
    );
  });
}

/**
 * Клетки позади выбранной фигуры: в пацанских шахматах ей туда уже нельзя, и
 * доска их затемняет (docs/MODES.md, режим 6). «Позади» считается от того,
 * куда смотрит её сторона.
 */
export function behindSquares(position: Position, from: string): string[] {
  const { geometry } = position;
  const at = parseSquare(geometry, from);
  const mover = at === null ? null : position.board[at];
  const forward = mover ? position.sides[mover.side]?.forward : null;
  if (at === null || !forward) return [];

  const file = fileOf(geometry, at);
  const rank = rankOf(geometry, at);
  const behind: string[] = [];

  position.board.forEach((_, square) => {
    const dx = fileOf(geometry, square) - file;
    const dy = rankOf(geometry, square) - rank;
    if (dx * forward[0] + dy * forward[1] < 0) {
      behind.push(squareName(geometry, square));
    }
  });

  return behind;
}

/** Куда можно выставить фигуру этого вида из резерва. */
export function dropTargets(
  position: Position,
  legal: readonly Move[],
  kind: PieceKind,
): Set<string> {
  const targets = new Set<string>();

  for (const move of legal) {
    if (move.from !== DROP || move.piece.kind !== kind) continue;
    targets.add(squareName(position.geometry, move.to));
  }

  return targets;
}

/** Ход выставления на эту клетку; `undefined` — так нельзя. */
export function dropTo(
  position: Position,
  legal: readonly Move[],
  kind: PieceKind,
  to: string,
): Move | undefined {
  return legal.find(
    (move) =>
      move.from === DROP &&
      move.piece.kind === kind &&
      squareName(position.geometry, move.to) === to,
  );
}

/** Каков ход: есть ли он вообще и нужна ли для него фигура превращения. */
export function moveKind(
  position: Position,
  legal: readonly Move[],
  from: string,
  to: string,
): "none" | "plain" | "promotion" {
  const matching = movesBetween(position, legal, from, to);

  if (matching.length === 0) return "none";
  return matching.some((move) => move.promotion !== null)
    ? "promotion"
    : "plain";
}

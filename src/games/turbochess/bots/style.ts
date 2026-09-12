import { DROP, inCheck, type Move, play } from "../engine/moves";
import type { Position } from "../engine/position";
import type { Style } from "./characters";
import type { Candidate } from "./search";

/**
 * Манера характера: выбор между ходами, которые перебору почти безразличны.
 *
 * Надбавка не идёт в оценку и не трогает перебор — она только переставляет
 * кандидатов местами, и только внутри узкого коридора от лучшего хода. Дальше
 * коридора характер не распространяется: манера, из-за которой бот отдаёт
 * фигуру, читается как поломка, а не как характер.
 */

/**
 * Насколько ход может быть хуже лучшего, чтобы характер имел право его
 * предпочесть. Полпешки: заметно для манеры, незаметно для счёта.
 */
export const STYLE_BUDGET = 60;

/** Каков ход по виду — всё, на что у характера есть мнение. */
export interface Shape {
  capture: boolean;
  check: boolean;
  promotion: boolean;
  castle: boolean;
  drop: boolean;
  /** Вперёд, к чужому краю. */
  forward: boolean;
  /** Назад, к своему. */
  back: boolean;
  /** На край доски. */
  edge: boolean;
}

/** Разобрать ход: что в нём есть такого, на что смотрит характер. */
export function shapeOf(position: Position, move: Move, check = false): Shape {
  const { geometry } = position;
  const rules = position.sides[move.piece.side];
  const [dx, dy] = rules?.forward ?? [0, 1];

  const fromX = move.from === DROP ? 0 : move.from % geometry.width;
  const fromY = move.from === DROP ? 0 : Math.floor(move.from / geometry.width);
  const toX = move.to % geometry.width;
  const toY = Math.floor(move.to / geometry.width);
  const gained =
    move.from === DROP ? 0 : dx * (toX - fromX) + dy * (toY - fromY);

  return {
    capture: move.captured !== null,
    check,
    promotion: move.promotion !== null,
    castle: move.castle !== null,
    drop: move.from === DROP,
    forward: gained > 0,
    back: gained < 0,
    edge:
      toX === 0 ||
      toY === 0 ||
      toX === geometry.width - 1 ||
      toY === geometry.height - 1,
  };
}

/** Надбавка характера этому ходу. */
export function bonusOf(shape: Shape, style: Style): number {
  let bonus = 0;

  if (shape.capture) bonus += style.capture;
  if (shape.check) bonus += style.check;
  if (shape.promotion) bonus += style.promotion;
  if (shape.castle) bonus += style.castle;
  if (shape.drop) bonus += style.drop;
  if (shape.forward) bonus += style.advance;
  if (shape.back) bonus += style.retreat;
  if (shape.edge) bonus += style.edge;

  return bonus;
}

/**
 * Переставить кандидатов по вкусу характера.
 *
 * Ходы вне коридора остаются на своих местах и в том же порядке: они нужны
 * дальше, при зевке уровня, и трогать их не за что.
 */
export function preferStyle(
  position: Position,
  candidates: readonly Candidate[],
  style: Style,
): Candidate[] {
  const best = candidates[0];
  if (!best || candidates.length < 2) return [...candidates];

  const inside: { candidate: Candidate; taste: number }[] = [];
  const outside: Candidate[] = [];

  for (const candidate of candidates) {
    if (best.score - candidate.score <= STYLE_BUDGET) {
      // Шах виден только после хода, и считать его на весь список дорого — но
      // коридор узкий, и здесь это несколько позиций.
      const after = play(position, candidate.move);
      const shape = shapeOf(
        position,
        candidate.move,
        inCheck(after, after.turn),
      );
      inside.push({
        candidate,
        taste: candidate.score + bonusOf(shape, style),
      });
    } else {
      outside.push(candidate);
    }
  }

  inside.sort((left, right) => right.taste - left.taste);

  return [...inside.map((entry) => entry.candidate), ...outside];
}

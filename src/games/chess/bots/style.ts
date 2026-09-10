import type { MoveShape } from "../engine/rules";
import type { Candidate } from "./engine";
import type { Style } from "./characters";

/**
 * Манера характера: выбор между ходами, которые движку почти безразличны.
 *
 * Надбавка не идёт в движок и не трогает его оценку — она только переставляет
 * кандидатов местами, и только внутри узкого коридора от лучшего хода. Дальше
 * коридора характер не распространяется: манера, из-за которой бот отдаёт
 * фигуру, читается как поломка, а не как характер
 * (src/games/chess/docs/BACKLOG.md D4).
 */

/**
 * Насколько ход может быть хуже лучшего, чтобы характер имел право его
 * предпочесть. Полпешки: заметно для манеры, незаметно для счёта.
 */
export const STYLE_BUDGET = 60;

/** Каков ход по виду. Приходит из правил: движок про взятия не знает. */
export type Describe = (uci: string) => MoveShape | null;

/** Надбавка характера этому ходу. */
export function bonusOf(shape: MoveShape, style: Style): number {
  let bonus = 0;

  if (shape.captured) bonus += style.capture;
  if (shape.check) bonus += style.check;
  if (shape.promotion) bonus += style.promotion;
  if (shape.castle) bonus += style.castle;

  return bonus;
}

/**
 * Переставить кандидатов по вкусу характера.
 *
 * Ходы вне коридора остаются на своих местах и в том же порядке: они нужны
 * дальше, при зевке уровня, и трогать их не за что.
 */
export function preferStyle(
  candidates: readonly Candidate[],
  style: Style,
  describe: Describe,
): Candidate[] {
  const best = candidates[0];
  if (!best || candidates.length < 2) return [...candidates];

  const inBudget: Candidate[] = [];
  const rest: Candidate[] = [];
  for (const candidate of candidates) {
    (best.score - candidate.score <= STYLE_BUDGET ? inBudget : rest).push(
      candidate,
    );
  }

  const liked = inBudget
    .map((candidate) => {
      const shape = describe(candidate.move);
      return {
        candidate,
        weight: candidate.score + (shape ? bonusOf(shape, style) : 0),
      };
    })
    // Устойчиво: при равных весах порядок движка сохраняется, и один и тот же
    // характер в одной и той же позиции ходит одинаково.
    .sort((left, right) => right.weight - left.weight)
    .map((entry) => entry.candidate);

  return [...liked, ...rest];
}

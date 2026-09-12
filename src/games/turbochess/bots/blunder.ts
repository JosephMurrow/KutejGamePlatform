import type { Candidate } from "./search";
import type { Level } from "./levels";
import type { CharacterTraits } from "./characters";

/**
 * Выбор хода из кандидатов: иногда — не лучший.
 *
 * Бот, ослабленный одной только глубиной, ошибается не по-человечески: он
 * играет ровно и вдруг не видит очевидного. Поэтому ошибку выбираем сами — из
 * списка кандидатов и в известных пределах, чтобы она читалась как слабый
 * соперник, а не как поломка (docs/BACKLOG.md E3).
 */

/** Насколько бот склонен ошибаться в этой партии и как сильно. */
export interface Sloppiness {
  /** Доля ходов, в которых берётся не лучший вариант. */
  chance: number;
  /** Насколько худший ход допустим, в сотых долях пешки. */
  maxLoss: number;
}

/**
 * Склонность к ошибке: уровень плюс характер плюс усталость.
 *
 * Характер добавляет к уровню своё: Пьянчуга зевает и на Эксперте, а Сбитый
 * лётчик сдаёт к концу партии — на то он и сбитый. Ни то, ни другое не должно
 * превращать сильный уровень в слабый, поэтому надбавки небольшие и общий
 * потолок — две трети ходов.
 */
export function sloppinessOf(
  level: Level,
  traits: CharacterTraits,
  ply: number,
): Sloppiness {
  const tired = traits.fade * Math.floor(Math.max(0, ply) / 20);
  const chance = Math.min(0.66, level.sloppiness + traits.sloppy + tired);
  // Допуск ошибки у уровня без зевков — свой: иначе характер получил бы право
  // ошибаться как угодно сильно, а «ферзь под пешку» читается как баг.
  const maxLoss = level.maxLoss > 0 ? level.maxLoss : 70;

  return { chance, maxLoss };
}

/**
 * Взять ход: обычно лучший, иногда — подходящий похуже.
 *
 * Кандидаты приходят отсортированными (лучший первым) и уже переставленными по
 * вкусу характера, поэтому «лучший» здесь значит «первый».
 */
export function pick(
  candidates: readonly Candidate[],
  sloppiness: Sloppiness,
  roll: () => number,
): Candidate | null {
  const best = candidates[0];
  if (!best) return null;
  if (candidates.length === 1 || sloppiness.chance <= 0) return best;
  if (roll() >= sloppiness.chance) return best;

  // Ошибка выбирается из тех ходов, что хуже лучшего, но не катастрофически:
  // так слабый уровень выглядит слабым, а не сломанным.
  const worse = candidates.filter(
    (candidate) =>
      candidate !== best &&
      best.score - candidate.score > 0 &&
      best.score - candidate.score <= sloppiness.maxLoss,
  );
  if (worse.length === 0) return best;

  const at = Math.min(worse.length - 1, Math.floor(roll() * worse.length));
  return worse[at] ?? best;
}

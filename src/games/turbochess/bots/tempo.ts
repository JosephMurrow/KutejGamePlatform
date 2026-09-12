import type { Level } from "./levels";
import type { CharacterTraits } from "./characters";

/**
 * Пауза перед ходом: программа, отвечающая мгновенно, — это программа.
 *
 * Обвязка «притворяется человеком» перенесена от шахмат копией (docs/BACKLOG.md
 * E2), но считается по-своему: там паузу равняли по времени, которое движок
 * потратил на перебор, а наш перебор укладывается в миллисекунды при любой
 * глубине. Значит пауза — целиком выдумка, и строится она из трёх вещей:
 * сколько ходов в позиции, насколько силён уровень и насколько тороплив
 * характер.
 */

/** Меньше этого не думает никто: мгновенный ответ выдаёт программу. */
export const MIN_PAUSE_MS = 400;

/** Больше этого не думает никто: человек за доской тоже не засыпает. */
export const MAX_PAUSE_MS = 7_000;

/**
 * Сколько бот «думает» над ходом.
 *
 * `limitMs` — остаток на часах: думать дольше, чем дано на ход, значит уронить
 * флаг на ровном месте. Берём с запасом в четверть: остальное уйдёт на дорогу
 * до браузера.
 */
export function pauseMs(
  level: Level,
  traits: CharacterTraits,
  moves: number,
  roll: () => number,
  limitMs: number | null = null,
): number {
  const width = Math.min(moves, 40);
  const thinking = 420 + width * 38 + level.depth * 160;
  const jitter = 0.75 + roll() * 0.6;
  const wanted = thinking * traits.tempo * jitter;

  const ceiling =
    limitMs === null ? MAX_PAUSE_MS : Math.min(MAX_PAUSE_MS, limitMs * 0.75);

  return Math.round(
    Math.min(Math.max(wanted, MIN_PAUSE_MS), Math.max(ceiling, MIN_PAUSE_MS)),
  );
}

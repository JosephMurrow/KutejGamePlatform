import type { Candidate } from "./engine";
import type { Level } from "./levels";

/**
 * Выбор хода из кандидатов: иногда — не лучший.
 *
 * Движок, ослабленный штатной ручкой, всё равно ошибается не по-человечески:
 * он играет ровно и вдруг делает что-то бессмысленное. Поэтому ошибку выбираем
 * сами — из списка кандидатов и в известных пределах, чтобы она читалась как
 * слабый соперник, а не как баг (src/games/chess/docs/BACKLOG.md D2).
 */

/** Насколько уровень склонен ошибаться и как сильно. */
export interface Sloppiness {
  /** Доля ходов, в которых бот берёт не лучший вариант. */
  chance: number;
  /**
   * Насколько худший ход допустим, в сотых долях пешки.
   *
   * Полторы пешки — это заметная ошибка, но не «ферзь под пешку»: такой ход
   * читается как баг, а не как слабая игра.
   */
  maxLoss: number;
}

const SLOPPY: Record<Level["id"], Sloppiness> = {
  easy: { chance: 0.35, maxLoss: 150 },
  normal: { chance: 0.15, maxLoss: 90 },
  hard: { chance: 0.05, maxLoss: 50 },
  // Эксперт не ошибается нарочно: его сила и так честная.
  expert: { chance: 0, maxLoss: 0 },
  // Магнус не ошибается тем более: он вместо этого жульничает.
  magnus: { chance: 0, maxLoss: 0 },
};

/**
 * Сколько вариантов просить у движка.
 *
 * Больше одного нужно и для зевков уровня, и для манеры характера: и то и
 * другое — выбор из списка, а список надо сначала получить.
 */
export function variantsFor(level: Level, picky = false): number {
  return SLOPPY[level.id].chance > 0 || picky ? 4 : 1;
}

/**
 * Выбрать ход.
 *
 * Возвращается кандидат целиком, а не ход: оценка нужна дальше — по ней бот
 * замечает зевок соперника и решает, сколько думать (см. `watch.ts`,
 * `tempo.ts`).
 *
 * `random` приходит параметром, чтобы выбор можно было проверить тестами: без
 * него «иногда ошибается» проверяется только на глаз.
 */
export function chooseMove(
  candidates: readonly Candidate[],
  level: Level,
  random: () => number = Math.random,
): Candidate | null {
  const best = candidates[0];
  if (!best) return null;

  const { chance, maxLoss } = SLOPPY[level.id];
  if (chance === 0 || candidates.length < 2 || random() >= chance) {
    return best;
  }

  // Ошибаемся только тем, что не хуже порога: остальное — не ошибка, а подстава.
  const sloppy = candidates
    .slice(1)
    .filter((candidate) => best.score - candidate.score <= maxLoss);
  if (sloppy.length === 0) return best;

  // Из подходящих берём худший: ошибка должна быть заметна, иначе она
  // бессмысленна.
  return sloppy.reduce((left, right) =>
    right.score < left.score ? right : left,
  );
}

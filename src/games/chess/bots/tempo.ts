import { MATE_SCORE, type Candidate } from "./engine";

/**
 * Пауза перед ходом бота.
 *
 * Задержка идёт от сложности позиции и **включает** время поиска, а не
 * добавляется к нему: иначе на слабом уровне бот думает мгновенно, а на
 * сильном — заметно дольше, и уровень становится слышен по часам, а не по игре.
 *
 * Мат в один тоже не мгновенен: нижняя граница есть всегда. Человек, который
 * ставит мат за сорок миллисекунд, — это не сильный соперник, это программа
 * (src/games/chess/docs/BACKLOG.md D5).
 */

/** Меньше этого бот не отвечает никогда — даже когда ход вынужден. */
export const MIN_PAUSE_MS = 450;
/** Больше этого не думает даже над самой мутной позицией. */
export const MAX_PAUSE_MS = 4200;

/** Разрыв, после которого выбор считается очевидным, в сотых долях пешки. */
const CLEAR_GAP = 200;
/** Сколько добавляется за самый трудный выбор. */
const HARD_CHOICE_MS = 2400;
/** Базовая заминка: столько уходит просто на то, чтобы взяться за фигуру. */
const BASE_MS = 600;
/** Доля лимита на ход, за которую бот не выходит: флаг ему ронять незачем. */
const LIMIT_SHARE = 0.5;

export interface PauseInput {
  /** Сколько уже потрачено на поиск. */
  spentMs: number;
  candidates: readonly Candidate[];
  /** Множитель характера: быдло рубит сплеча, дед сидит. */
  tempo: number;
  /** Лимит на ход, если он есть. */
  limitMs: number | null;
  random?: () => number;
}

/**
 * Сколько ещё подождать, прежде чем ходить.
 *
 * Ноль означает «поиск и так занял всё положенное»: пауза не добавляется, она
 * только добирает недостающее.
 */
export function pauseAfter({
  spentMs,
  candidates,
  tempo,
  limitMs,
  random = Math.random,
}: PauseInput): number {
  return Math.max(
    0,
    Math.round(targetOf(candidates, tempo, limitMs, random) - spentMs),
  );
}

/** Сколько всего должен занять ход бота: поиск вместе с паузой. */
function targetOf(
  candidates: readonly Candidate[],
  tempo: number,
  limitMs: number | null,
  random: () => number,
): number {
  const best = candidates[0];
  const second = candidates[1];

  // Ход один — думать не над чем, но и выпаливать его мгновенно не надо.
  let target =
    BASE_MS + (best && !second ? 0 : HARD_CHOICE_MS * hardness(best, second));

  // Позиция решена: мат виден, и тянуть с ним неестественно.
  if (best && Math.abs(best.score) >= MATE_SCORE - 1000) target *= 0.6;

  // Разброс в четверть: одинаковые паузы выдают машину не хуже мгновенных.
  target *= 0.75 + random() * 0.5;
  target *= tempo;

  const ceiling =
    limitMs === null
      ? MAX_PAUSE_MS
      : Math.min(MAX_PAUSE_MS, Math.max(MIN_PAUSE_MS, limitMs * LIMIT_SHARE));

  return Math.min(ceiling, Math.max(MIN_PAUSE_MS, target));
}

/**
 * Насколько труден выбор: от нуля (очевидный) до единицы (два хода вровень).
 *
 * Считается по разрыву между двумя лучшими: когда движок сам не может
 * решить, человек на этом месте и правда сидит дольше.
 */
function hardness(best?: Candidate, second?: Candidate): number {
  if (!best || !second) return 0;

  const gap = Math.abs(best.score - second.score);
  return Math.max(0, 1 - gap / CLEAR_GAP);
}

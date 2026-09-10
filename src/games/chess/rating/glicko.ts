import { glicko2 } from "glicko2-lite";

/**
 * Рейтинг по Glicko-2 — та же система, что у Lichess.
 *
 * Обёртка вокруг готового пакета. Сам счёт в нём и делается; здесь то, чего в
 * пакете нет и быть не должно: границы, ленивый рост неуверенности от простоя и
 * признак «рейтинг ещё не устоялся» (src/games/chess/docs/BACKLOG.md E1).
 *
 * Рейтинговый период — одна партия. Так рейтинг меняется сразу после доски, а
 * не ждёт конца недели.
 */

/** С чего начинает новичок. */
export const START_RATING = 1500;
/** Начальное отклонение: система о новичке не знает ничего. */
export const START_DEVIATION = 350;
export const START_VOLATILITY = 0.06;

/** Системная постоянная: насколько резво разрешено меняться волатильности. */
const TAU = 0.5;

/** Границы. Без них одна дикая партия уводит рейтинг в бессмыслицу. */
export const MIN_RATING = 400;
export const MAX_RATING = 3500;
/** Ниже этого отклонение не опускается: полной уверенности не бывает. */
export const MIN_DEVIATION = 30;
export const MAX_DEVIATION = START_DEVIATION;
/** Больше этого за одну партию рейтинг не меняется. */
export const MAX_CHANGE = 300;

/**
 * Отклонение, выше которого рейтинг считается провизорным.
 *
 * То же значение, что у Lichess: примерно после десятка партий система
 * перестаёт гадать, и рейтинг можно показывать без оговорки.
 */
export const PROVISIONAL_DEVIATION = 110;

/**
 * Насколько отклонение растёт за сутки простоя.
 *
 * Подобрано так, чтобы от самого уверенного значения до максимума был примерно
 * год: вернувшийся через год играет как новичок и чужие рейтинги не обваливает,
 * а вернувшийся через неделю почти ничего не теряет.
 */
const IDLE_DAYS_TO_MAX = 365;
const IDLE_GROWTH =
  (MAX_DEVIATION ** 2 - MIN_DEVIATION ** 2) / IDLE_DAYS_TO_MAX;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Рейтинг игрока целиком: одного числа тут мало. */
export interface Rating {
  rating: number;
  deviation: number;
  volatility: number;
  /** Когда рейтинг считали в последний раз. */
  ratedAt: Date;
}

/** Соперник глазами счёта: волатильность чужая нам не нужна. */
export interface Opponent {
  rating: number;
  deviation: number;
}

/** Чем кончилась партия для игрока: победа, ничья, поражение. */
export type Score = 0 | 0.5 | 1;

/** Одна сыгранная партия глазами счёта. */
export interface Played {
  opponent: Opponent;
  score: Score;
}

/** Рейтинг того, кто ещё не играл. */
export function fresh(now: Date = new Date()): Rating {
  return {
    rating: START_RATING,
    deviation: START_DEVIATION,
    volatility: START_VOLATILITY,
    ratedAt: now,
  };
}

/**
 * Отклонение, выросшее за простой.
 *
 * Считается по времени, а не пачками: иначе рейтинг замирает между
 * пересчётами, и человек, не игравший полгода, до следующего периода выглядит
 * так же уверенно, как вчерашний.
 */
export function idle(
  rating: Pick<Rating, "deviation" | "ratedAt">,
  now: Date,
): number {
  const days = Math.max(0, (now.getTime() - rating.ratedAt.getTime()) / DAY_MS);
  const grown = Math.sqrt(rating.deviation ** 2 + IDLE_GROWTH * days);

  return Math.min(MAX_DEVIATION, grown);
}

/**
 * Пересчитать рейтинг за период.
 *
 * У нас период — одна партия, и партия в списке обычно одна. Список всё равно
 * принимается: так через эту же дверь проходит эталонный пример автора системы,
 * а он в один период укладывает три партии. Считать его в обход обёртки значило
 * бы проверять чужой пакет вместо своего кода.
 *
 * Отклонение соперника берётся как есть: его простой учтётся, когда он сам
 * сядет за доску. Считать чужой простой здесь — значит менять чужую строку из
 * своей партии.
 */
export function rate(
  player: Rating,
  played: readonly Played[],
  now: Date = new Date(),
): Rating {
  if (played.length === 0) {
    // Не играл — только неуверенность подросла.
    return { ...player, deviation: idle(player, now), ratedAt: now };
  }

  const deviation = idle(player, now);

  const next = glicko2(
    player.rating,
    deviation,
    player.volatility,
    played.map(({ opponent, score }) => [
      opponent.rating,
      opponent.deviation,
      score,
    ]),
    { tau: TAU },
  );

  return {
    rating: bounded(player.rating, next.rating),
    deviation: clamp(next.rd, MIN_DEVIATION, MAX_DEVIATION),
    volatility: next.vol,
    ratedAt: now,
  };
}

/**
 * Устоялся ли рейтинг.
 *
 * Провизорный показывается с вопросительным знаком и в верхушку таблицы не
 * попадает: пять партий подряд с сильным соперником поднимают его выше, чем
 * он заслуживает.
 */
export function isProvisional(rating: Pick<Rating, "deviation">): boolean {
  return rating.deviation > PROVISIONAL_DEVIATION;
}

/** Новый рейтинг в границах — и общих, и на изменение за партию. */
function bounded(was: number, now: number): number {
  const capped = clamp(now, was - MAX_CHANGE, was + MAX_CHANGE);

  return clamp(capped, MIN_RATING, MAX_RATING);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

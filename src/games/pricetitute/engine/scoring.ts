import { isNever, type Bet } from "./bet";

/**
 * Подсчёт очков раунда (см. src/games/pricetitute/docs/SPEC.md §5.2).
 *
 * Близость меряется по порядку величины: важно, во сколько раз игрок
 * промахнулся, а не на сколько рублей. При ответе ведущего 100 000 ₽ ставка
 * 130 000 ближе, чем 70 000, хотя по абсолютной разнице обе мимо одинаково.
 *
 * Очко нужно заслужить: сначала отсеиваются все, кто промахнулся больше чем
 * вдвое, и лишь среди оставшихся ищется ближайший. Без этого порога
 * единственная ставка побеждала бы всегда — при игре вдвоём очко уходило
 * каждый раунд, даже при промахе в шестьсот раз.
 */

/** Допуск при сравнении расстояний: логарифмы редко совпадают бит в бит. */
const TIE_EPSILON = 1e-9;

/** Во сколько раз можно промахнуться и всё ещё претендовать на очко. */
export const MAX_MISS_FACTOR = 2;

const MAX_DISTANCE = Math.log10(MAX_MISS_FACTOR);

export interface PlayerBet {
  playerId: string;
  bet: Bet;
}

export interface RoundOutcome {
  /** Кто получил очко. Пусто, если никто не угадал достаточно близко. */
  winners: string[];
  /**
   * Промах игрока по логарифмической шкале, для наглядной вскрышки.
   * null — ставка в этом раунде не участвует в сравнении.
   */
  distances: Record<string, number | null>;
}

/**
 * «Бесплатно» и «Ни за какие деньги» — категории, а не суммы: сравнивать их с
 * числом бессмысленно, попадание засчитывается только точное.
 */
function isCategorical(bet: Bet): boolean {
  return isNever(bet) || bet === 0;
}

/**
 * Насколько ставка далека от ответа ведущего.
 * null означает «не сравнимо».
 */
export function distance(bet: Bet, hostAnswer: Bet): number | null {
  // Проверка развёрнута, а не спрятана в isCategorical: только так
  // TypeScript понимает, что дальше hostAnswer — точно число.
  if (isNever(hostAnswer) || hostAnswer === 0) {
    return bet === hostAnswer ? 0 : null;
  }
  if (isNever(bet)) return null;

  // «Бесплатно» против числового ответа — это просто самая низкая ставка.
  return Math.abs(Math.log10(Math.max(bet, 1)) - Math.log10(hostAnswer));
}

export function resolveRound(
  hostAnswer: Bet,
  bets: readonly PlayerBet[],
): RoundOutcome {
  const scored = bets.map((entry) => ({
    playerId: entry.playerId,
    bet: entry.bet,
    distance: distance(entry.bet, hostAnswer),
  }));

  const distances: Record<string, number | null> = {};
  for (const entry of scored) {
    distances[entry.playerId] = entry.distance;
  }

  // Крайние ответы: очко только тем, кто назвал ровно то же самое.
  if (isCategorical(hostAnswer)) {
    return {
      winners: scored
        .filter((entry) => entry.bet === hostAnswer)
        .map((entry) => entry.playerId),
      distances,
    };
  }

  // Сначала отсев по порогу, потом поиск ближайшего среди оставшихся.
  // Обратный порядок оставил бы раунд без победителя в случае, когда
  // ближайший по шкале в порог не уложился, а кто-то другой уложился.
  const eligible = scored.filter(
    (entry): entry is typeof entry & { distance: number } =>
      entry.distance !== null && entry.distance <= MAX_DISTANCE + TIE_EPSILON,
  );
  if (eligible.length === 0) return { winners: [], distances };

  const closest = Math.min(...eligible.map((entry) => entry.distance));

  return {
    winners: eligible
      .filter((entry) => entry.distance <= closest + TIE_EPSILON)
      .map((entry) => entry.playerId),
    distances,
  };
}

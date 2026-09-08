import { randomInt } from "node:crypto";

/**
 * Память о сказанном: одна фраза не звучит в комнате чаще раза в пять минут.
 *
 * Ограничение общее на комнату, а не на каждого бота: два разных бота с
 * одинаковой репликой подряд выглядят хуже, чем один повторившийся спустя
 * полчаса.
 */
export const PHRASE_COOLDOWN_MS = 5 * 60 * 1000;

/** Как выбирать среди равных. Подменяется в тестах. */
export type Pick = (max: number) => number;

export class PhraseMemory {
  private readonly saidAt = new Map<string, number>();

  /**
   * Свежая фраза из набора. Если весь набор ещё «горячий» — а это бывает у
   * коротких наборов при череде сгоревших раундов, — берётся та, что молчала
   * дольше всех: промолчать вовсе хуже, чем повториться.
   */
  pick(
    pool: readonly string[],
    now: number = Date.now(),
    choose: Pick = randomInt,
  ): string | null {
    if (pool.length === 0) return null;

    // Отсутствие записи — это «не звучала вовсе», а не «звучала в нулевой
    // момент»: подставлять сюда ноль значит объявить весь набор горячим на
    // первые пять минут жизни отсчёта.
    const fresh = pool.filter((phrase) => {
      const at = this.saidAt.get(phrase);
      return at === undefined || now - at >= PHRASE_COOLDOWN_MS;
    });

    const phrase =
      fresh.length > 0
        ? (fresh[choose(fresh.length)] ?? fresh[0])
        : this.stalest(pool);

    if (phrase === undefined) return null;

    this.saidAt.set(phrase, now);
    return phrase;
  }

  /** Забыть всё сказанное: комната закрылась или боты ушли. */
  clear(): void {
    this.saidAt.clear();
  }

  private stalest(pool: readonly string[]): string | undefined {
    const at = (phrase: string) =>
      this.saidAt.get(phrase) ?? Number.NEGATIVE_INFINITY;

    return pool.reduce<string | undefined>((oldest, phrase) => {
      if (oldest === undefined) return phrase;
      return at(phrase) < at(oldest) ? phrase : oldest;
    }, undefined);
  }
}

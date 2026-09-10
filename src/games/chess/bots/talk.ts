import { URGENT } from "./moments";

/**
 * Голос бота: что сказать и когда промолчать.
 *
 * Два правила, и оба про меру. Бот не повторяет фразу дважды за партию — иначе
 * сорок реплик на момент не спасают, слышно всё равно одну. И бот молчит
 * ближайшие три полухода после того, как заговорил, — кроме мата: на нём
 * молчание заметнее любой болтовни (src/games/chess/docs/BACKLOG.md D4).
 *
 * Чьи это реплики, говорящему безразлично: набор приходит снаружи. У четверых
 * характеров он один, у Магнуса — свой, и в нём есть моменты, которых у
 * остальных быть не может: он жульничает.
 */

/** Сколько полуходов бот молчит после своей реплики. */
export const QUIET_PLIES = 3;

export class Talker<Key extends string> {
  /** Что уже сказано за эту партию: повторов не будет. */
  private readonly said = new Set<string>();
  /** На каком полуходе бот говорил в последний раз. */
  private spokeAt = -QUIET_PLIES;

  constructor(
    private readonly lines: Record<Key, string[]>,
    private readonly random: () => number = Math.random,
  ) {}

  /**
   * Реплика на момент; `null` — сейчас молчим.
   *
   * `ply` нужен для паузы: считать её в миллисекундах бессмысленно, партия
   * может идти и по десять секунд на ход, и без часов вовсе.
   */
  say(moment: Key, ply: number): string | null {
    if (!this.allowed(moment, ply)) return null;

    const pool = this.lines[moment];
    if (pool.length === 0) return null;

    const fresh = pool.filter((line) => !this.said.has(line));
    // Набор кончился — партия вышла необычно длинной. Повториться лучше, чем
    // онеметь до конца доски.
    const from = fresh.length > 0 ? fresh : pool;

    const line = from[Math.floor(this.random() * from.length)] ?? from[0];
    if (line === undefined) return null;

    this.said.add(line);
    this.spokeAt = ply;

    return line;
  }

  /** Новая партия за тем же столом: память чистая, пауза снята. */
  reset(): void {
    this.said.clear();
    this.spokeAt = -QUIET_PLIES;
  }

  private allowed(moment: Key, ply: number): boolean {
    if ((URGENT as string[]).includes(moment)) return true;
    return ply - this.spokeAt >= QUIET_PLIES;
  }
}

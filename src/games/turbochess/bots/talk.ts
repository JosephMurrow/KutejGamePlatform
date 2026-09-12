import type { Moment } from "./moments";

/**
 * Голос бота: что сказать и когда промолчать.
 *
 * Два правила, и оба про меру. **Колода без возврата:** сыгравшая реплика
 * выбывает до конца партии — иначе одна и та же шутка звучит трижды за десять
 * ходов, и полсотни реплик на момент не спасают. **Пауза:** сказав, бот молчит
 * ближайшие несколько полуходов — кроме конца партии, на котором молчание
 * заметнее любой болтовни (docs/BOTS.md, E5).
 *
 * Чьи это реплики, говорящему безразлично: колода приходит снаружи. Так один и
 * тот же класс обслуживает одиннадцать характеров и не знает ни одного из них.
 */

/** Сколько полуходов бот молчит после своей реплики. */
export const QUIET_PLIES = 3;

/** Моменты, на которых пауза не действует: тут молчать нельзя. */
const ALWAYS: readonly Moment[] = [
  "greeting",
  "botMates",
  "botMated",
  "botWins",
  "botLoses",
  "draw",
  "rematch",
];

/** Колода характера: на каждый момент свой список. */
export type Lines = Partial<Record<Moment, readonly string[]>>;

export class Talker {
  /** Что уже сказано за эту партию: повторов не будет. */
  private readonly said = new Set<string>();
  /** На каком полуходе бот говорил в последний раз. */
  private spokeAt = -QUIET_PLIES;

  constructor(
    private readonly lines: Lines,
    private readonly random: () => number = Math.random,
  ) {}

  /**
   * Реплика на момент; `null` — сейчас молчим.
   *
   * `ply` нужен для паузы: считать её в миллисекундах бессмысленно, партия
   * может идти и по десять секунд на ход, и без часов вовсе.
   */
  say(moment: Moment, ply: number): string | null {
    const deck = this.lines[moment];
    if (!deck || deck.length === 0) return null;
    if (!this.allowed(moment, ply)) return null;

    const fresh = deck.filter((line) => !this.said.has(line));
    // Колода кончилась — бот на этот момент больше не говорит. Так и задумано:
    // лучше тишина, чем шутка по второму кругу.
    const pool = fresh.length > 0 ? fresh : [];
    if (pool.length === 0) return null;

    const at = Math.min(
      pool.length - 1,
      Math.floor(this.random() * pool.length),
    );
    const line = pool[at];
    if (!line) return null;

    this.said.add(line);
    this.spokeAt = ply;
    return line;
  }

  /** Пора ли говорить: пауза кончилась или момент её не терпит. */
  private allowed(moment: Moment, ply: number): boolean {
    if (ALWAYS.includes(moment)) return true;
    return ply - this.spokeAt >= QUIET_PLIES;
  }

  /** Новая партия: забыть сказанное и паузу. */
  restart(): void {
    this.said.clear();
    this.spokeAt = -QUIET_PLIES;
  }

  /** Сколько реплик ещё не звучало — для проверок. */
  left(moment: Moment): number {
    const deck = this.lines[moment] ?? [];
    return deck.filter((line) => !this.said.has(line)).length;
  }
}

/**
 * Сколько бот «печатает» реплику.
 *
 * Мгновенная реплика выдаёт программу так же, как мгновенный ход. Считается от
 * длины: три знака в секунду плюс секунда на «взял телефон», но не дольше пяти
 * — дольше человек успевает сходить.
 */
export function typingMs(
  line: string,
  roll: () => number = Math.random,
): number {
  const typed = 900 + line.length * 45 * (0.8 + roll() * 0.5);
  return Math.round(Math.min(5_000, Math.max(700, typed)));
}

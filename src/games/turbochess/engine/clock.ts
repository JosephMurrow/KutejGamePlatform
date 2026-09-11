/**
 * Часы партии: лимит на ход, а не бюджет на всю партию.
 *
 * Тикают только у того, чей ход, и после каждого хода счёт начинается заново.
 * Это ровно один дедлайн — и потому ложится на будильник платформы без единой
 * правки договора движка.
 *
 * Взято копией у шахмат (src/games/chess/engine/clock.ts): игра не импортирует
 * игру, а про правила часы не знают ничего.
 *
 * Время сюда приходит параметром: монотонное — для измерений, настенное — для
 * дедлайна, который уедет клиенту. Настенные часы прыгают при синхронизации, и
 * партия, померенная ими, может внезапно проиграться по флагу.
 */

/** Источник монотонного времени. Подменяется в тестах. */
export type Ticker = () => number;

export class MoveClock {
  /** Момент начала текущего хода по монотонным часам; null — часы стоят. */
  private startedAt: number | null = null;

  constructor(
    /** Сколько даётся на ход. `null` — без ограничения. */
    private readonly limitMs: number | null,
    private readonly now: Ticker,
  ) {}

  /** Есть ли ограничение вообще. */
  get limited(): boolean {
    return this.limitMs !== null;
  }

  /** Пошёл новый ход: счёт начинается заново. */
  restart(): void {
    this.startedAt = this.now();
  }

  /** Часы остановлены: партия кончилась или ещё не началась. */
  stop(): void {
    this.startedAt = null;
  }

  get running(): boolean {
    return this.startedAt !== null;
  }

  /**
   * Сколько осталось на ход, мс. `null` — часы стоят или лимита нет, и тогда
   * платформа не заводит таймер вовсе.
   */
  left(): number | null {
    if (this.limitMs === null || this.startedAt === null) return null;

    return Math.max(0, this.limitMs - (this.now() - this.startedAt));
  }

  /** Время на ход вышло. */
  expired(): boolean {
    const left = this.left();

    return left !== null && left <= 0;
  }
}

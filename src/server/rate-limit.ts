/**
 * Скользящее окно: не больше `limit` событий за `windowMs` на ключ.
 *
 * Лимитер живёт в памяти процесса, и память у него должна быть конечной:
 * ключом бывает всё, что прислал посторонний, — логин, адрес почты, строка из
 * формы сброса. Раньше ключи не удалялись никогда, и поток выдуманных строк
 * раздувал процесс без предела, а вместе с ним падали бы все партии
 * (docs/SECURITY.md, S-R1). Поэтому здесь две защиты: уборка и потолок.
 *
 * - **Уборка** ленивая: раз в окно лимитер сам выбрасывает ключи, у которых
 *   все отметки устарели. Таймера нет, гасить при выключении нечего.
 * - **Потолок** на число ключей: переполнение выталкивает ключ, который дольше
 *   всех не трогали. Это компромисс: поток из `maxKeys` новых ключей за одно
 *   окно вытолкнет и чей-то настоящий счётчик. Поэтому потолок большой, а
 *   лимит по адресу клиента (S-R2) не даёт одному источнику набрать столько
 *   ключей.
 */
export interface RateLimiterOptions {
  /** Потолок числа ключей. По умолчанию 50 000. */
  maxKeys?: number;
}

const DEFAULT_MAX_KEYS = 50_000;

export class RateLimiter {
  /**
   * Отметки по ключам. Порядок вставки в `Map` — это порядок последнего
   * обращения: трогая ключ, переставляем его в конец, и первый ключ всегда
   * самый давний.
   */
  private readonly hits = new Map<string, number[]>();
  private readonly maxKeys: number;
  private lastSweep = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    options: RateLimiterOptions = {},
  ) {
    this.maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  }

  /** Пропустить событие и засчитать его. `false` — лимит исчерпан. */
  allow(key: string, now = Date.now()): boolean {
    if (this.blocked(key, now)) return false;

    this.hit(key, now);
    return true;
  }

  /**
   * Исчерпан ли лимит — без того, чтобы засчитывать попытку. Нужно там, где
   * считать стоит только неудачи: вход проверяет лимит до пароля, а отметку
   * ставит, только если пароль не подошёл.
   */
  blocked(key: string, now = Date.now()): boolean {
    this.maybeSweep(now);
    return this.recent(key, now).length >= this.limit;
  }

  /**
   * Засчитать событие. `weight` больше единицы — штраф: такая попытка съедает
   * лимит быстрее обычной.
   */
  hit(key: string, now = Date.now(), weight = 1): void {
    this.maybeSweep(now);

    const recent = this.recent(key, now);
    for (let i = 0; i < weight; i++) recent.push(now);

    this.hits.delete(key);
    this.hits.set(key, recent);
    this.enforceCeiling(now);
  }

  forget(key: string): void {
    this.hits.delete(key);
  }

  /** Сколько ключей сейчас помнит лимитер. */
  get size(): number {
    return this.hits.size;
  }

  /**
   * Выбросить ключи, у которых не осталось ни одной свежей отметки. Возвращает
   * число выброшенных. Зовётся сама раз в окно; снаружи — для тестов.
   */
  sweep(now = Date.now()): number {
    this.lastSweep = now;
    const since = now - this.windowMs;
    let removed = 0;

    for (const [key, stamps] of this.hits) {
      if (stamps.every((at) => at <= since)) {
        this.hits.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /** Свежие отметки ключа; устаревшие отбрасываются по дороге. */
  private recent(key: string, now: number): number[] {
    const since = now - this.windowMs;
    return (this.hits.get(key) ?? []).filter((at) => at > since);
  }

  private maybeSweep(now: number): void {
    if (now - this.lastSweep >= this.windowMs) this.sweep(now);
  }

  private enforceCeiling(now: number): void {
    if (this.hits.size <= this.maxKeys) return;

    // Сперва честная уборка: может, выбрасывать живые счётчики не придётся.
    this.sweep(now);

    for (const key of this.hits.keys()) {
      if (this.hits.size <= this.maxKeys) break;
      this.hits.delete(key);
    }
  }
}

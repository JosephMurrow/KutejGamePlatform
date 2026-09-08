/**
 * Очередь вопросов комнаты (см. src/games/pricetitute/docs/SPEC.md §6).
 *
 * Правила:
 * - вопрос берётся с головы очереди;
 * - пока очередь не исчерпана, повторов нет;
 * - когда закончилась — пул перемешивается заново;
 * - сгоревший вопрос (ведущий не нажал «Прочитал» или не успел ввести сумму)
 *   возвращается в нижнюю треть очереди на случайную позицию.
 *
 * Структура чистая и не знает ни про базу, ни про сокеты: генератор случайных
 * чисел передаётся снаружи, чтобы тесты были детерминированными.
 */

export type Rng = () => number;

/** Доля очереди с конца, куда падает сгоревший вопрос. */
const BURN_ZONE = 1 / 3;

/** Состояние очереди для сохранения между перезапусками сервера. */
export interface QueueSnapshot {
  /** Вопросы, которые ещё предстоит задать, по порядку. */
  queue: string[];
  /** Вопросы, уже выданные в текущем круге. */
  consumed: string[];
}

export class QuestionQueue {
  /** Весь доступный пул: из него пересобирается очередь при исчерпании. */
  private readonly pool: string[];
  /** Тот же пул для проверки принадлежности. */
  private readonly known: Set<string>;
  /** Текущая очередь; голова — нулевой элемент. */
  private items: string[];
  /**
   * Выданные в этом круге вопросы. Нужны, чтобы после перезапуска сервера
   * уже показанное не вернулось в очередь как «новое».
   */
  private consumed: Set<string>;
  private readonly rng: Rng;

  private constructor(
    pool: string[],
    items: string[],
    consumed: Set<string>,
    rng: Rng,
  ) {
    this.pool = pool;
    this.known = new Set(pool);
    this.items = items;
    this.consumed = consumed;
    this.rng = rng;
  }

  /** Новая перемешанная очередь из всего пула. */
  static create(
    pool: readonly string[],
    rng: Rng = Math.random,
  ): QuestionQueue {
    const ids = [...pool];
    return new QuestionQueue(ids, shuffle(ids, rng), new Set(), rng);
  }

  /**
   * Восстановление сохранённой очереди. Идентификаторы, которых больше нет в
   * пуле, отбрасываются. Вопросы, добавленные в пул после сохранения,
   * дописываются в хвост вперемешку — так новинки не ждут полного круга,
   * а уже показанное не всплывает повторно.
   */
  static restore(
    pool: readonly string[],
    saved: QueueSnapshot,
    rng: Rng = Math.random,
  ): QuestionQueue {
    const known = new Set(pool);
    const items = saved.queue.filter((id) => known.has(id));
    const consumed = new Set(saved.consumed.filter((id) => known.has(id)));

    const placed = new Set([...items, ...consumed]);
    const fresh = pool.filter((id) => !placed.has(id));

    return new QuestionQueue(
      [...pool],
      [...items, ...shuffle(fresh, rng)],
      consumed,
      rng,
    );
  }

  /**
   * Следующий вопрос. Когда очередь опустела, пул перемешивается и круг
   * начинается заново. null — только если пул пуст.
   */
  next(): string | null {
    if (this.items.length === 0) {
      this.items = shuffle([...this.pool], this.rng);
      this.consumed = new Set();
    }

    const id = this.items.shift() ?? null;
    if (id !== null) this.consumed.add(id);

    return id;
  }

  /**
   * Вернуть сгоревший вопрос в нижнюю треть очереди на случайную позицию.
   * Вопросы не из пула игнорируются.
   */
  burn(id: string): void {
    if (!this.known.has(id)) return;

    this.consumed.delete(id);

    const zoneStart = Math.floor(this.items.length * (1 - BURN_ZONE));
    const slots = this.items.length - zoneStart + 1;
    const index = zoneStart + Math.floor(this.rng() * slots);

    this.items.splice(index, 0, id);
  }

  /** Сколько вопросов осталось до перетасовки. */
  get remaining(): number {
    return this.items.length;
  }

  /** Размер всего пула. */
  get size(): number {
    return this.pool.length;
  }

  /** Снимок для сохранения в базу. */
  snapshot(): QueueSnapshot {
    return { queue: [...this.items], consumed: [...this.consumed] };
  }
}

/** Тасовка Фишера — Йетса на копии массива. */
function shuffle<T>(input: readonly T[], rng: Rng): T[] {
  const items = [...input];

  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = items[i];
    const b = items[j];
    if (a !== undefined && b !== undefined) {
      items[i] = b;
      items[j] = a;
    }
  }

  return items;
}

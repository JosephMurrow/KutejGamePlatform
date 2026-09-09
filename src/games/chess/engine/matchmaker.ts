/**
 * Очередь общего зала и подбор соперника.
 *
 * Отдельно от зала и без единого ожидания внутри: пока идёт подбор, никто не
 * должен успеть схватить того же человека вторым
 * (src/games/chess/docs/BACKLOG.md A1).
 */

export interface Waiting {
  id: string;
  /** Когда встал в очередь: по нему очередь и упорядочена. */
  since: number;
}

/** Пара, готовая сесть за доску. Первый играет белыми. */
export type Pair = [string, string];

export class Matchmaker {
  private readonly line: Waiting[] = [];

  /** Встать в очередь. Повторный вход ничего не меняет. */
  enter(id: string, now: number): void {
    if (this.line.some((waiting) => waiting.id === id)) return;
    this.line.push({ id, since: now });
  }

  /** Выйти из очереди — сам или потому что сел за доску. */
  leave(id: string): void {
    const at = this.line.findIndex((waiting) => waiting.id === id);
    if (at >= 0) this.line.splice(at, 1);
  }

  waiting(): readonly Waiting[] {
    return this.line;
  }

  waits(id: string): boolean {
    return this.line.some((waiting) => waiting.id === id);
  }

  /**
   * Собрать пары из очереди — столько, сколько получится.
   *
   * Всё делается разом и без ожиданий: подбор, снятие с очереди и возврат пар.
   * Стоит вставить сюда хоть один `await` — и двое схватят одного и того же
   * соперника.
   */
  pairs(): Pair[] {
    const made: Pair[] = [];

    while (this.line.length >= 2) {
      const first = this.line.shift();
      if (!first) break;

      const at = choose(first, this.line);
      if (at < 0) {
        // Никто не подошёл: возвращаем первого на место и прекращаем — иначе
        // очередь будет крутиться впустую.
        this.line.unshift(first);
        break;
      }

      const [second] = this.line.splice(at, 1);
      if (second) made.push([first.id, second.id]);
    }

    return made;
  }
}

/**
 * Кого посадить с тем, кто стоит первым.
 *
 * Пока — следующего в очереди: рейтинга ещё нет, а ждать «подходящего» в
 * пустом зале значит не играть вовсе. Отдельной функцией, чтобы окно по
 * рейтингу вставилось сюда одной правкой (src/games/chess/docs/BACKLOG.md A1).
 */
function choose(first: Waiting, rest: readonly Waiting[]): number {
  return rest.length > 0 && first ? 0 : -1;
}

import { UciEngine, type Candidate, type ThinkRequest } from "./engine";

/**
 * Пул движков: один-два долгоживущих процесса на все партии сразу.
 *
 * Запускать движок на каждый ход нельзя — старт стоит дороже самого хода, а
 * держать по процессу на партию значит отдать сервер десятку игроков. Отсюда
 * пул и очередь: кто не поместился, ждёт своей очереди, но не бесконечно
 * (src/games/chess/docs/BACKLOG.md D1).
 */

/** Сколько ждать ход, прежде чем считать, что движок не справился. */
const THINK_TIMEOUT_MS = 8000;

/** Сколько ждать своей очереди к движку. */
const QUEUE_TIMEOUT_MS = 12_000;

/** Тот, кто ждёт освободившийся движок. */
interface Pending {
  /** Отдать ждущему движок — или `null`, если ждать больше нечего. */
  hand: (engine: UciEngine | null) => void;
}

export class EnginePool {
  private readonly free: UciEngine[] = [];
  private readonly queue: Pending[] = [];
  private started = 0;
  private stopped = false;

  constructor(
    private readonly path: string,
    /** Больше этого числа процессов не заводим ни при какой нагрузке. */
    private readonly size = 2,
  ) {}

  /** Есть ли чем думать вообще. Пустой путь означает «ботов нет». */
  get available(): boolean {
    return this.path !== "" && !this.stopped;
  }

  /**
   * Подумать над позицией.
   *
   * `null` — движка нет, он не справился или очередь оказалась слишком
   * длинной. Комната на это отвечает по-своему: партия с ботом, который не
   * ходит, не должна висеть вечно.
   */
  async think(request: ThinkRequest): Promise<string | null> {
    const [best] = await this.candidates(request);

    return best?.move ?? null;
  }

  /**
   * Подумать и вернуть кандидатов, лучший первым.
   *
   * Пустой список — движка нет, он не справился или очередь оказалась слишком
   * длинной. Комната на это отвечает по-своему: партия с ботом, который не
   * ходит, не должна висеть вечно.
   */
  async candidates(request: ThinkRequest): Promise<Candidate[]> {
    if (!this.available) return [];

    const engine = await this.take();
    if (!engine) return [];

    try {
      return await engine.candidates(request, THINK_TIMEOUT_MS);
    } finally {
      this.give(engine);
    }
  }

  stop(): void {
    this.stopped = true;
    for (const engine of this.free) engine.stop();
    this.free.length = 0;

    // Ждущим отвечаем честно, а не оставляем висеть.
    for (const pending of this.queue) pending.hand(null);
    this.queue.length = 0;
  }

  /** Взять свободный движок: поднять новый, дождаться чужого или сдаться. */
  private async take(): Promise<UciEngine | null> {
    const free = this.free.pop();
    if (free?.alive) return free;

    if (this.started < this.size) {
      this.started += 1;
      try {
        return await UciEngine.start(this.path);
      } catch (error) {
        this.started -= 1;
        console.error("[chess] движок не запустился:", error);
        return null;
      }
    }

    return this.waitTurn();
  }

  private waitTurn(): Promise<UciEngine | null> {
    return new Promise((resolve) => {
      const pending: Pending = { hand: () => {} };

      const timer = setTimeout(() => {
        const at = this.queue.indexOf(pending);
        if (at >= 0) this.queue.splice(at, 1);
        resolve(null);
      }, QUEUE_TIMEOUT_MS);
      timer.unref?.();

      pending.hand = (engine) => {
        clearTimeout(timer);
        resolve(engine);
      };

      this.queue.push(pending);
    });
  }

  /** Вернуть движок в пул — или отдать его тому, кто ждёт. */
  private give(engine: UciEngine): void {
    if (this.stopped || !engine.alive) {
      engine.stop();
      this.started -= 1;
      return;
    }

    const next = this.queue.shift();
    if (next) {
      next.hand(engine);
      return;
    }

    this.free.push(engine);
  }
}

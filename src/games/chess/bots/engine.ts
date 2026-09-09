import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

/**
 * Движок шахмат отдельным процессом, разговор по UCI через потоки.
 *
 * Отдельный процесс — не прихоть. В браузер движок нельзя по трём причинам:
 * многопоточность там требует полной кросс-доменной изоляции, которая ломает
 * встроенный плеер Твича; движок во вкладке — это подсказка игроку; а жульничество
 * Магнуса видно в отладчике. И лицензия: отдельный процесс не заражает наш код,
 * импорт в бандл — заражает (src/games/chess/docs/BACKLOG.md D1).
 */

/** Сколько ждать ответа, прежде чем считать процесс потерянным. */
const HANDSHAKE_MS = 5000;

/** Кандидат: ход и его оценка глазами движка. */
export interface Candidate {
  /** Ход в координатах: `e2e4`, `a7a8q`. */
  move: string;
  /**
   * Оценка позиции после хода, в сотых долях пешки, с точки зрения ходящего.
   * Мат считается очень большой оценкой — так его не спутать с перевесом.
   */
  score: number;
}

export interface ThinkRequest {
  /** Позиция, из которой думать. */
  fen: string;
  /** Целевой рейтинг: движок сам подстроит силу. */
  elo: number;
  /**
   * Потолок просмотренных позиций.
   *
   * Силу ограничиваем узлами, а не временем: время зависит от загрузки
   * сервера, и один и тот же уровень играл бы по-разному на пустом и на
   * занятом (src/games/chess/docs/BACKLOG.md D1).
   */
  nodes: number;
  /**
   * Сколько вариантов просить. Больше одного нужно для зевков: ошибаться надо
   * из списка кандидатов, а не случайной клеткой
   * (src/games/chess/docs/BACKLOG.md D2).
   */
  variants?: number;
}

/** Мат в оценке: не бесконечность, но заведомо больше любого перевеса. */
export const MATE_SCORE = 100_000;

export class UciEngine {
  private readonly process: ChildProcessWithoutNullStreams;
  /** Хвост строки, не дочитанной из потока. */
  private tail = "";
  private listeners: ((line: string) => void)[] = [];
  private dead = false;

  private constructor(path: string) {
    this.process = spawn(path, [], { stdio: "pipe" });
    this.process.stdout.setEncoding("utf8");
    this.process.stdout.on("data", (chunk: string) => this.read(chunk));
    this.process.on("exit", () => {
      this.dead = true;
    });
    // Движок пишет в stderr предупреждения; они нам не нужны, но и ронять
    // сервер из-за них незачем.
    this.process.stderr.on("data", () => {});
  }

  static async start(path: string): Promise<UciEngine> {
    const engine = new UciEngine(path);

    engine.send("uci");
    await engine.await_((line) => line === "uciok");
    engine.send("setoption name Threads value 1");
    engine.send("isready");
    await engine.await_((line) => line === "readyok");

    return engine;
  }

  get alive(): boolean {
    return !this.dead;
  }

  /**
   * Подумать над позицией и вернуть ход в координатах: `e2e4`, `a7a8q`.
   *
   * `null` — движок не ответил за отведённое время. Он остаётся жив: убивать
   * его на каждой заминке дороже, чем подождать следующего хода.
   */
  /**
   * Подумать над позицией и вернуть кандидатов, лучший первым.
   *
   * Пустой список — движок не ответил за отведённое время. Он остаётся жив:
   * убивать его на каждой заминке дороже, чем подождать следующего хода.
   */
  async candidates(
    request: ThinkRequest,
    timeoutMs: number,
  ): Promise<Candidate[]> {
    if (this.dead) return [];

    const variants = Math.max(1, request.variants ?? 1);
    const found = new Map<number, Candidate>();

    const collect = (line: string) => {
      const candidate = parseInfo(line);
      if (candidate) found.set(candidate.rank, candidate.value);
    };
    this.listeners.push(collect);

    try {
      this.send("setoption name UCI_LimitStrength value true");
      this.send(`setoption name UCI_Elo value ${Math.round(request.elo)}`);
      this.send(`setoption name MultiPV value ${variants}`);
      this.send(`position fen ${request.fen}`);
      this.send(`go nodes ${Math.round(request.nodes)}`);

      const answer = await this.await_(
        (line) => line.startsWith("bestmove"),
        timeoutMs,
      );
      if (!answer) {
        // Оставлять движок думающим нельзя: следующий запрос получит чужой
        // ответ.
        this.send("stop");
        return [];
      }

      const best = answer.split(/\s+/)[1];
      if (!best || best === "(none)") return [];

      const ranked = [...found.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, value]) => value);

      // Движок объявляет лучший ход отдельно; на всякий случай ставим его
      // первым, даже если разбор строк что-то упустил.
      return ranked.some((candidate) => candidate.move === best)
        ? ranked
        : [{ move: best, score: 0 }, ...ranked];
    } finally {
      this.listeners = this.listeners.filter(
        (listener) => listener !== collect,
      );
    }
  }

  /** Лучший ход, без разбора кандидатов. */
  async bestMove(
    request: ThinkRequest,
    timeoutMs: number,
  ): Promise<string | null> {
    const [best] = await this.candidates(request, timeoutMs);

    return best?.move ?? null;
  }

  stop(): void {
    if (this.dead) return;

    this.dead = true;
    this.send("quit");
    // Если не ушёл сам — добиваем: висящий движок ест процессор молча.
    setTimeout(() => this.process.kill("SIGKILL"), 500).unref?.();
  }

  private send(command: string): void {
    if (!this.dead) this.process.stdin.write(`${command}\n`);
  }

  private read(chunk: string): void {
    this.tail += chunk;
    const lines = this.tail.split("\n");
    this.tail = lines.pop() ?? "";

    for (const line of lines) {
      const clean = line.trim();
      if (!clean) continue;
      for (const listener of [...this.listeners]) listener(clean);
    }
  }

  /** Дождаться строки, подходящей под условие. */
  private await_(
    matches: (line: string) => boolean,
    timeoutMs = HANDSHAKE_MS,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const done = (value: string | null) => {
        this.listeners = this.listeners.filter(
          (listener) => listener !== onLine,
        );
        clearTimeout(timer);
        resolve(value);
      };

      const onLine = (line: string) => {
        if (matches(line)) done(line);
      };

      const timer = setTimeout(() => done(null), timeoutMs);
      timer.unref?.();
      this.listeners.push(onLine);
    });
  }
}

/** Разобрать строку `info ... multipv N ... score ... pv MOVE ...`. */
function parseInfo(line: string): { rank: number; value: Candidate } | null {
  if (!line.startsWith("info ") || !line.includes(" pv ")) return null;

  const rank = Number(/ multipv (\d+)/.exec(line)?.[1] ?? 1);
  const move = / pv (\S+)/.exec(line)?.[1];
  if (!move) return null;

  const centipawns = / score cp (-?\d+)/.exec(line)?.[1];
  const mate = / score mate (-?\d+)/.exec(line)?.[1];

  const score = mate
    ? (Number(mate) > 0 ? MATE_SCORE : -MATE_SCORE) - Number(mate)
    : Number(centipawns ?? 0);

  return { rank, value: { move, score } };
}

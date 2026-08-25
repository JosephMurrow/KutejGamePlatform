import type { Bet } from "./bet";
import { resolveRound, type PlayerBet, type RoundOutcome } from "./scoring";

/**
 * Машина состояний комнаты (см. docs/SPEC.md §4).
 *
 * Внутри нет ни таймеров, ни сокетов, ни базы: время приходит снаружи
 * параметром `now`, вопросы — через QuestionSource. Транспорт дёргает `tick`
 * по расписанию и рассылает `view()` после каждого изменения.
 */

export type Phase =
  | "waiting"
  | "ready"
  | "host_answer"
  | "betting"
  | "reveal"
  /** Партия доиграна до условия конца: висит экран победителя. */
  | "finished";

/** Чем заканчивается партия (см. docs/SPEC.md §3.2). */
export type EndMode = "endless" | "rounds" | "points";

export interface RoomOptions {
  timings?: Partial<RoomTimings>;
  endMode?: EndMode;
  /** Сколько раундов или очков до конца партии. */
  endValue?: number | null;
  /** Хозяин приватной комнаты: только он выгоняет игроков и начинает заново. */
  ownerId?: string | null;
}

export interface RoomTimings {
  /** Сколько у ведущего есть на кнопку «Прочитал». */
  readyMs: number;
  /** Сколько у ведущего есть на ввод своей суммы. */
  hostAnswerMs: number;
  /** Сколько игроки делают ставки. */
  bettingMs: number;
  /** Сколько висит вскрышка перед следующим раундом. */
  revealMs: number;
}

export const DEFAULT_TIMINGS: RoomTimings = {
  readyMs: 20_000,
  hostAnswerMs: 15_000,
  bettingMs: 300_000,
  revealMs: 30_000,
};

/** Ведущий плюс хотя бы один игрок. */
export const MIN_PLAYERS = 2;

export interface QuestionSource {
  next(): string | null;
  burn(id: string): void;
}

export type AbortReason =
  /** Не нажал «Прочитал» за отведённое время. */
  | "host_silent"
  /** Нажал, но не ввёл свою сумму. */
  | "host_no_answer"
  /** Вышел из комнаты посреди раунда. */
  | "host_left";

export type PauseReason = "not_enough_players" | "no_questions";

/** Завершённый раунд — то, что уходит в базу. */
export interface RoundRecord {
  questionId: string;
  hostId: string;
  hostAnswer: Bet;
  bets: PlayerBet[];
  outcome: RoundOutcome;
  finishedAt: number;
}

export type GameEvent =
  | { type: "round_started"; hostId: string; questionId: string }
  | {
      type: "round_aborted";
      reason: AbortReason;
      questionId: string;
      /** Кто не успел: нужен, чтобы боты подкалывали живого, а не своих. */
      hostId: string;
    }
  | { type: "round_resolved"; record: RoundRecord }
  | { type: "paused"; reason: PauseReason }
  | { type: "game_finished"; winners: string[] };

export interface ActionResult {
  accepted: boolean;
  /** Почему действие отклонено — текст уходит игроку. */
  reason?: string;
  events: GameEvent[];
}

export interface PlayerView {
  id: string;
  score: number;
  roundsPlayed: number;
  /** Поставил ли в текущем раунде. Сама ставка до вскрышки не видна. */
  hasBet: boolean;
  isHost: boolean;
}

export interface RevealView {
  hostAnswer: Bet;
  bets: PlayerBet[];
  winners: string[];
  distances: Record<string, number | null>;
}

export interface RoomView {
  key: string;
  phase: Phase;
  /** Абсолютное время окончания фазы, unix ms. null — фаза без таймера. */
  deadline: number | null;
  /** Полная длительность текущей фазы: клиенту нужна для шкалы отсчёта. */
  phaseDurationMs: number | null;
  hostId: string | null;
  questionId: string | null;
  /** В фазе READY текст вопроса уходит только ведущему. */
  questionVisibleToAll: boolean;
  players: PlayerView[];
  /** Заполнено только в фазе вскрышки. */
  reveal: RevealView | null;
  /** Почему комната стоит: заполнено только в фазе ожидания. */
  pauseReason: PauseReason | null;
  /** Победители партии: заполнено только на финальном экране. */
  winners: string[] | null;
  /** Сколько раундов сыграно в текущей партии. */
  roundsPlayed: number;
  endMode: EndMode;
  endValue: number | null;
  ownerId: string | null;
}

interface PlayerStats {
  score: number;
  roundsPlayed: number;
}

export class Room {
  private readonly order: string[] = [];
  /** Индекс следующего ведущего в круге. */
  private cursor = 0;
  private phase: Phase = "waiting";
  private deadline: number | null = null;
  private questionId: string | null = null;
  private hostId: string | null = null;
  private hostAnswer: Bet | null = null;
  private readonly bets = new Map<string, Bet>();
  private reveal: RevealView | null = null;
  private pauseReason: PauseReason | null = null;
  private winners: string[] | null = null;
  /** Сыграно раундов в текущей партии — для условия конца по раундам. */
  private roundsPlayed = 0;
  private readonly stats = new Map<string, PlayerStats>();

  private readonly timings: RoomTimings;
  private readonly endMode: EndMode;
  private readonly endValue: number | null;
  private readonly ownerId: string | null;

  constructor(
    readonly key: string,
    private readonly questions: QuestionSource,
    options: RoomOptions = {},
  ) {
    this.timings = { ...DEFAULT_TIMINGS, ...options.timings };
    this.endMode = options.endMode ?? "endless";
    this.endValue = options.endValue ?? null;
    this.ownerId = options.ownerId ?? null;
  }

  // — Действия игроков ————————————————————————————————————————

  join(playerId: string, now: number): ActionResult {
    if (this.order.includes(playerId)) {
      return { accepted: false, reason: "Ты уже в комнате", events: [] };
    }

    this.order.push(playerId);
    if (!this.stats.has(playerId)) {
      this.stats.set(playerId, { score: 0, roundsPlayed: 0 });
    }

    if (this.phase === "waiting") {
      return { accepted: true, events: this.startRound(now) };
    }

    return { accepted: true, events: [] };
  }

  leave(playerId: string, now: number): ActionResult {
    const index = this.order.indexOf(playerId);
    if (index === -1) {
      return { accepted: false, reason: "Игрока нет в комнате", events: [] };
    }

    this.order.splice(index, 1);
    if (this.order.length === 0) {
      this.cursor = 0;
    } else {
      if (index < this.cursor) this.cursor -= 1;
      this.cursor %= this.order.length;
    }

    const roundActive = this.phase !== "waiting" && this.phase !== "reveal";

    // Игроков стало меньше двух — играть не с кем.
    if (this.order.length < MIN_PLAYERS && this.phase !== "waiting") {
      return { accepted: true, events: this.pause("not_enough_players") };
    }

    // Ушёл ведущий — раунд аннулируется, вопрос возвращается в пул.
    if (roundActive && playerId === this.hostId) {
      return { accepted: true, events: this.abortRound("host_left", now) };
    }

    // Возможно, оставшиеся уже все поставили.
    if (this.phase === "betting") {
      return { accepted: true, events: this.closeBettingIfEveryoneBet(now) };
    }

    return { accepted: true, events: [] };
  }

  /** Ведущий нажал «Прочитал». */
  confirmRead(playerId: string, now: number): ActionResult {
    if (this.phase !== "ready") {
      return { accepted: false, reason: "Сейчас не время читать", events: [] };
    }
    if (playerId !== this.hostId) {
      return { accepted: false, reason: "Ты не ведущий", events: [] };
    }

    this.phase = "host_answer";
    this.deadline = now + this.timings.hostAnswerMs;

    return { accepted: true, events: [] };
  }

  /** Ведущий ввёл свою сумму — открываем ставки. */
  submitHostAnswer(playerId: string, bet: Bet, now: number): ActionResult {
    if (this.phase !== "host_answer") {
      return {
        accepted: false,
        reason: "Сейчас не время отвечать",
        events: [],
      };
    }
    if (playerId !== this.hostId) {
      return { accepted: false, reason: "Ты не ведущий", events: [] };
    }

    this.hostAnswer = bet;
    this.phase = "betting";
    this.deadline = now + this.timings.bettingMs;

    return { accepted: true, events: [] };
  }

  placeBet(playerId: string, bet: Bet, now: number): ActionResult {
    if (this.phase !== "betting") {
      return {
        accepted: false,
        reason: "Ставки сейчас не принимаются",
        events: [],
      };
    }
    if (playerId === this.hostId) {
      return {
        accepted: false,
        reason: "Ведущий не ставит в своём раунде",
        events: [],
      };
    }
    if (!this.order.includes(playerId)) {
      return { accepted: false, reason: "Тебя нет в комнате", events: [] };
    }
    if (this.bets.has(playerId)) {
      return {
        accepted: false,
        reason: "Ставка уже сделана, менять нельзя",
        events: [],
      };
    }

    this.bets.set(playerId, bet);

    return { accepted: true, events: this.closeBettingIfEveryoneBet(now) };
  }

  /** Тик времени: закрывает фазу, если её дедлайн прошёл. */
  tick(now: number): GameEvent[] {
    if (this.deadline === null || now < this.deadline) return [];

    switch (this.phase) {
      case "ready":
        return this.abortRound("host_silent", now);
      case "host_answer":
        return this.abortRound("host_no_answer", now);
      case "betting":
        return this.resolve(now);
      case "reveal":
        return this.shouldFinish() ? this.finish() : this.startRound(now);
      case "waiting":
      case "finished":
        return [];
    }
  }

  /** Хозяин приватной комнаты выгоняет игрока. */
  /**
   * Ответ ведущего до вскрышки — только для серверного кода.
   *
   * В `view()` и в снимок для клиента он не попадает намеренно: на этом
   * держится вся игра. Нужен ботам, которые в комнате с живыми людьми ставят
   * вокруг настоящего ответа, а не наугад.
   */
  peekHostAnswer(): Bet | null {
    return this.hostAnswer;
  }

  kick(requesterId: string, targetId: string, now: number): ActionResult {
    if (this.ownerId === null || requesterId !== this.ownerId) {
      return {
        accepted: false,
        reason: "Выгонять может только хозяин комнаты",
        events: [],
      };
    }
    if (targetId === this.ownerId) {
      return { accepted: false, reason: "Себя выгнать нельзя", events: [] };
    }

    return this.leave(targetId, now);
  }

  /** Хозяин начинает новую партию после финального экрана. */
  restart(requesterId: string, now: number): ActionResult {
    if (this.ownerId === null || requesterId !== this.ownerId) {
      return {
        accepted: false,
        reason: "Начать заново может только хозяин комнаты",
        events: [],
      };
    }
    if (this.phase !== "finished") {
      return { accepted: false, reason: "Партия ещё идёт", events: [] };
    }

    for (const stats of this.stats.values()) {
      stats.score = 0;
      stats.roundsPlayed = 0;
    }
    this.roundsPlayed = 0;
    this.winners = null;
    this.cursor = 0;

    return { accepted: true, events: this.startRound(now) };
  }

  // — Состояние ————————————————————————————————————————————

  view(): RoomView {
    return {
      key: this.key,
      phase: this.phase,
      deadline: this.deadline,
      phaseDurationMs: this.phaseDuration(),
      hostId: this.hostId,
      questionId: this.questionId,
      questionVisibleToAll:
        this.phase === "host_answer" ||
        this.phase === "betting" ||
        this.phase === "reveal",
      players: this.order.map((id) => {
        const stats = this.stats.get(id);
        return {
          id,
          score: stats?.score ?? 0,
          roundsPlayed: stats?.roundsPlayed ?? 0,
          hasBet: this.bets.has(id),
          isHost: id === this.hostId,
        };
      }),
      reveal: this.reveal,
      pauseReason: this.pauseReason,
      winners: this.winners,
      roundsPlayed: this.roundsPlayed,
      endMode: this.endMode,
      endValue: this.endValue,
      ownerId: this.ownerId,
    };
  }

  /** Подставить очки, поднятые из базы при создании комнаты. */
  setStats(playerId: string, stats: PlayerStats): void {
    this.stats.set(playerId, { ...stats });
  }

  get playerCount(): number {
    return this.order.length;
  }

  // — Внутреннее ————————————————————————————————————————————

  private startRound(now: number): GameEvent[] {
    if (this.order.length < MIN_PLAYERS) {
      return this.pause("not_enough_players");
    }

    const index = this.cursor % this.order.length;
    const host = this.order[index];
    if (host === undefined) return this.pause("not_enough_players");

    const questionId = this.questions.next();
    if (questionId === null) return this.pause("no_questions");

    this.cursor = (index + 1) % this.order.length;
    this.pauseReason = null;
    this.hostId = host;
    this.questionId = questionId;
    this.hostAnswer = null;
    this.bets.clear();
    this.reveal = null;
    this.phase = "ready";
    this.deadline = now + this.timings.readyMs;

    return [{ type: "round_started", hostId: host, questionId }];
  }

  private abortRound(reason: AbortReason, now: number): GameEvent[] {
    const questionId = this.questionId;
    const hostId = this.hostId;
    const events: GameEvent[] = [];

    if (questionId !== null && hostId !== null) {
      this.questions.burn(questionId);
      events.push({ type: "round_aborted", reason, questionId, hostId });
    }

    this.clearRound();

    return [...events, ...this.startRound(now)];
  }

  private resolve(now: number): GameEvent[] {
    const hostAnswer = this.hostAnswer;
    const hostId = this.hostId;
    const questionId = this.questionId;

    if (hostAnswer === null || hostId === null || questionId === null) {
      // Сюда попасть нельзя: ставки открываются только после ответа ведущего.
      return this.pause("not_enough_players");
    }

    const bets: PlayerBet[] = [...this.bets].map(([playerId, bet]) => ({
      playerId,
      bet,
    }));
    const outcome = resolveRound(hostAnswer, bets);

    for (const winner of outcome.winners) {
      const stats = this.statsFor(winner);
      stats.score += 1;
    }

    // Раунд считается сыгранным для ведущего и для всех, кто успел поставить.
    this.statsFor(hostId).roundsPlayed += 1;
    for (const bet of bets) {
      this.statsFor(bet.playerId).roundsPlayed += 1;
    }

    this.roundsPlayed += 1;
    this.reveal = {
      hostAnswer,
      bets,
      winners: outcome.winners,
      distances: outcome.distances,
    };
    this.phase = "reveal";
    this.deadline = now + this.timings.revealMs;

    return [
      {
        type: "round_resolved",
        record: {
          questionId,
          hostId,
          hostAnswer,
          bets,
          outcome,
          finishedAt: now,
        },
      },
    ];
  }

  /** Закрыть ставки досрочно, если поставили все, кроме ведущего. */
  private closeBettingIfEveryoneBet(now: number): GameEvent[] {
    if (this.phase !== "betting") return [];

    const waiting = this.order.filter(
      (id) => id !== this.hostId && !this.bets.has(id),
    );
    if (waiting.length > 0) return [];

    return this.resolve(now);
  }

  private pause(reason: PauseReason): GameEvent[] {
    const questionId = this.questionId;
    if (questionId !== null && this.phase !== "reveal") {
      this.questions.burn(questionId);
    }

    this.clearRound();
    this.phase = "waiting";
    this.deadline = null;
    this.pauseReason = reason;

    return [{ type: "paused", reason }];
  }

  private clearRound(): void {
    this.questionId = null;
    this.hostId = null;
    this.hostAnswer = null;
    this.bets.clear();
    this.reveal = null;
  }

  /** Пора ли заканчивать партию: проверяется после вскрышки. */
  private shouldFinish(): boolean {
    const target = this.endValue;
    if (target === null || target <= 0) return false;

    if (this.endMode === "rounds") {
      return this.roundsPlayed >= target;
    }
    if (this.endMode === "points") {
      return [...this.stats.values()].some((stats) => stats.score >= target);
    }

    return false;
  }

  private finish(): GameEvent[] {
    const scores = this.order.map((id) => this.stats.get(id)?.score ?? 0);
    const best = Math.max(0, ...scores);

    this.winners =
      best > 0
        ? this.order.filter((id) => (this.stats.get(id)?.score ?? 0) === best)
        : [];

    this.clearRound();
    this.phase = "finished";
    this.deadline = null;

    return [{ type: "game_finished", winners: this.winners }];
  }

  private phaseDuration(): number | null {
    switch (this.phase) {
      case "ready":
        return this.timings.readyMs;
      case "host_answer":
        return this.timings.hostAnswerMs;
      case "betting":
        return this.timings.bettingMs;
      case "reveal":
        return this.timings.revealMs;
      case "waiting":
      case "finished":
        return null;
    }
  }

  private statsFor(playerId: string): PlayerStats {
    const existing = this.stats.get(playerId);
    if (existing) return existing;

    const fresh: PlayerStats = { score: 0, roundsPlayed: 0 };
    this.stats.set(playerId, fresh);
    return fresh;
  }
}

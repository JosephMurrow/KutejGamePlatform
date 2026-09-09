import { randomUUID } from "node:crypto";
import type {
  ActionOutcome,
  GameRoomContext,
  GameRoomSnapshot,
  GameRoomState,
  GameViewer,
} from "@/lib/games/engine";
import type { Ticker } from "../engine/clock";
import { Matchmaker } from "../engine/matchmaker";
import { GAME_EVENT } from "../protocol";
import { START_RATING } from "../rooms/matches";
import type { ChessRoomSettings } from "../rooms/settings";
import { ChessRoom, type Persist } from "./room";

/**
 * Общий зал: одна платформенная комната, внутри — много досок сразу.
 *
 * Платформа умеет одну комнату на игру, а партий в зале десятки. Разбирали три
 * способа; выбран этот, потому что он не требует от платформы ничего нового:
 * `deadline()` отдаёт ближайший срок из всех досок, `tick()` разбирает
 * истёкшие, а `snapshot(viewer)` отдаёт каждому его партию
 * (src/games/chess/docs/BACKLOG.md A1).
 */

/** Зал играет полминуты на ход и не настраивается. */
export const LOBBY_SETTINGS: ChessRoomSettings = {
  timeControl: "SEC_30",
  opponent: "HUMAN",
  streamerMode: false,
};

/** Сколько партий показывать в сводке зала. */
const BOARDS_IN_SUMMARY = 8;

export class ChessLobby implements GameRoomState {
  /** Доски по ключу; ключ же уходит в запись партии. */
  private readonly boards = new Map<string, ChessRoom>();
  /** Кто за какой доской. */
  private readonly seats = new Map<string, string>();
  private readonly queue = new Matchmaker();
  /** Все, кто в зале: и за досками, и в очереди. */
  private readonly present = new Set<string>();

  constructor(
    private readonly context: GameRoomContext,
    private readonly now: Ticker = () => performance.now(),
    private readonly persist?: Persist,
  ) {}

  join(playerId: string): void {
    this.present.add(playerId);

    const board = this.boardOf(playerId);
    if (board) {
      // Вернулся к своей партии — она его ждала.
      board.join(playerId);
      return;
    }

    this.queue.enter(playerId, this.now());
    this.seatPairs();
    this.context.changed();
  }

  leave(playerId: string): void {
    this.present.delete(playerId);
    this.queue.leave(playerId);

    // За доской уход разбирает сама доска: место держится, часы идут, и через
    // отсрочку партия достаётся сопернику.
    this.boardOf(playerId)?.leave(playerId);
    this.context.changed();
  }

  /**
   * Кто в зале. Платформа считает по этому заполненность, а лимита у зала нет:
   * играющие и ждущие тут вперемешку, как и люди у столов в клубе.
   */
  seated(): readonly string[] {
    return [...this.present];
  }

  /** Ближайший срок из всех досок. */
  deadline(): number | null {
    let nearest: number | null = null;

    for (const board of this.boards.values()) {
      const at = board.deadline();
      if (at !== null && (nearest === null || at < nearest)) nearest = at;
    }

    return nearest;
  }

  /** Время вышло у кого-то — будим все доски, каждая разберётся сама. */
  tick(): void {
    for (const [key, board] of this.boards) {
      board.tick();
      if (board.isOver()) this.retire(key, board);
    }
  }

  act(event: string, actorId: string, payload: unknown): ActionOutcome {
    if (event === GAME_EVENT.rematch) return this.rematch(actorId);
    if (event === GAME_EVENT.leaveQueue) return this.unqueue(actorId);

    const board = this.boardOf(actorId);
    if (!board) {
      return { accepted: false, reason: "Ты ещё не за доской" };
    }

    const outcome = board.act(event, actorId, payload);
    if (board.isOver()) this.retire(this.seats.get(actorId) ?? "", board);

    return outcome;
  }

  /** В зале хозяина нет, выгонять некому. */
  remove(): ActionOutcome {
    return { accepted: false, reason: "В общем зале никого не выгоняют" };
  }

  snapshot(viewer: GameViewer): GameRoomSnapshot {
    const summary = {
      /** Сколько ждёт соперника. */
      waiting: this.queue.waiting().length,
      /** Сколько партий идёт прямо сейчас. */
      boards: this.boards.size,
      /** Сколько человек в зале всего. */
      present: this.present.size,
    };

    const board = viewer.kind === "player" ? this.boardOf(viewer.id) : null;
    if (board) {
      const own = board.snapshot();

      // Своя партия плюс сводка зала — и ничего про чужие доски. Полный список
      // партий на большом зале весил бы больше самой партии
      // (src/games/pricetitute/docs/BACKLOG.md N4).
      return {
        ...own,
        extra: { ...own.extra, lobby: summary },
      };
    }

    return {
      deadline: null,
      phaseDurationMs: null,
      playerCount: this.present.size,
      players: [],
      extra: {
        phase: "queue",
        fen: null,
        turn: null,
        moves: [],
        lastMove: null,
        claimable: null,
        result: null,
        reason: null,
        timeControl: LOBBY_SETTINGS.timeControl,
        streamerMode: false,
        rating: START_RATING,
        /** Стоит ли этот человек в очереди — от этого зависит, что ему рисовать. */
        queued: viewer.kind === "player" && this.queue.waits(viewer.id),
        lobby: summary,
        boardsShown: Math.min(this.boards.size, BOARDS_IN_SUMMARY),
      },
    };
  }

  settled(): Promise<void> {
    return Promise.resolve();
  }

  stop(): void {
    for (const board of this.boards.values()) board.stop();
    this.boards.clear();
    this.seats.clear();
  }

  /** Собрать пары из очереди и посадить их за доски. */
  private seatPairs(): void {
    for (const [white, black] of this.queue.pairs()) {
      const key = `${this.context.key}:${randomUUID()}`;
      const board = new ChessRoom(
        this.boardContext(key),
        LOBBY_SETTINGS,
        this.now,
        this.persist,
      );

      this.boards.set(key, board);
      this.seats.set(white, key);
      this.seats.set(black, key);

      board.join(white);
      board.join(black);
    }
  }

  /**
   * Партия кончилась: доска убирается, а игроки — нет.
   *
   * Обратно в очередь их никто не ставит: захотят ещё — нажмут сами. Молча
   * подсаживать к новому сопернику значит отнимать у человека паузу между
   * партиями.
   */
  private retire(key: string, board: ChessRoom): void {
    board.stop();
    this.boards.delete(key);

    for (const [playerId, at] of this.seats) {
      if (at === key) this.seats.delete(playerId);
    }
  }

  /** Ещё партия: встать в очередь заново. */
  private rematch(actorId: string): ActionOutcome {
    if (!this.present.has(actorId)) {
      return { accepted: false, reason: "Тебя нет в зале" };
    }
    if (this.boardOf(actorId)) {
      return { accepted: false, reason: "Партия ещё идёт" };
    }

    this.queue.enter(actorId, this.now());
    this.seatPairs();
    this.context.changed();

    return { accepted: true };
  }

  /** Передумал ждать: из очереди выходит, из зала — нет. */
  private unqueue(actorId: string): ActionOutcome {
    if (!this.queue.waits(actorId)) {
      return { accepted: false, reason: "Ты и не в очереди" };
    }

    this.queue.leave(actorId);
    this.context.changed();

    return { accepted: true };
  }

  private boardOf(playerId: string): ChessRoom | null {
    const key = this.seats.get(playerId);
    return key ? (this.boards.get(key) ?? null) : null;
  }

  /**
   * Что доска знает о мире.
   *
   * Своего контекста у неё нет: доска — не комната платформы, а стол внутри
   * зала. Рассылку и события она просит у зала, а тот — у платформы.
   */
  private boardContext(key: string): GameRoomContext {
    return {
      key,
      ownerId: null,
      isPrivate: false,
      settings: LOBBY_SETTINGS,
      connections: () => 2,
      introduce: () => {},
      forget: () => {},
      emitted: (events) => this.context.emitted(events),
      changed: () => this.context.changed(),
    };
  }
}

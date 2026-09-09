import type {
  ActionOutcome,
  GameRoomContext,
  GameRoomSnapshot,
  GameRoomState,
} from "@/lib/games/engine";
import { MoveClock, type Ticker } from "../engine/clock";
import type { Outcome } from "../engine/outcome";
import { ChessGame, type MoveInput } from "../engine/rules";
import { GAME_EVENT, type ChessColor, type ChessPhase } from "../protocol";
import { MOVE_LIMIT_MS, type ChessRoomSettings } from "../rooms/settings";

/**
 * Партия в одной комнате: стык правил с платформой.
 *
 * Платформа держит соединения, состав и рассылку; отсюда она получает только
 * дедлайн и снимок, а внутрь не смотрит — слова «шах» она не знает, как не
 * знает и слова «фаза» (docs/BACKLOG.md A3).
 */

/** За доской ровно два места. Остальные смотрят. */
const SEATS = 2;

/**
 * Сколько ждать ушедшего, прежде чем засчитать партию брошенной.
 *
 * Поверх платформенной отсрочки в пятнадцать секунд, которая переживает
 * перезагрузку страницы. Часы хода при этом **не останавливаются**: иначе
 * выдернутый кабель стал бы способом не проиграть
 * (src/games/chess/docs/BACKLOG.md A3).
 */
const ABANDON_MS = 90_000;

/**
 * Потолок партии. Лимит на ход ограничивает ход, но не партию: триста ходов по
 * полминуты — это два с половиной часа, а в безлимитной комнате партия не
 * кончится никогда.
 *
 * Проверяется на ходах, а не будильником: иначе безлимитная комната заводила
 * бы таймер, которого у неё быть не должно.
 */
const MAX_PLIES = 600;
const MAX_GAME_MS = 3 * 60 * 60 * 1000;

/** Кто ушёл и когда — момент по монотонным часам. */
interface Absence {
  id: string;
  since: number;
}

export class ChessRoom implements GameRoomState {
  private readonly game = new ChessGame();
  private readonly clock: MoveClock;
  /** Сидящие в порядке посадки: первый играет белыми. */
  private readonly seats: string[] = [];
  private absence: Absence | null = null;
  /** Момент начала партии по монотонным часам. */
  private startedAt: number | null = null;

  constructor(
    private readonly context: GameRoomContext,
    private readonly settings: ChessRoomSettings,
    private readonly now: Ticker = () => performance.now(),
  ) {
    this.clock = new MoveClock(MOVE_LIMIT_MS[settings.timeControl], now);
  }

  join(playerId: string): void {
    // Вернулся тот, кого ждали: место за ним и держали.
    if (this.absence?.id === playerId) this.absence = null;

    if (!this.seats.includes(playerId) && this.seats.length < SEATS) {
      this.seats.push(playerId);
      // Мест два; третий и дальше остаются зрителями — за столом их нет, но
      // партию они видят целиком.
      if (this.seats.length === SEATS) this.begin();
    }

    this.context.changed();
  }

  /**
   * Игрок ушёл: закрыл вкладки и не вернулся за платформенную отсрочку.
   *
   * Место за ним остаётся — иначе на него сядет зритель и партия окажется
   * втроём. Освободится оно вместе с концом партии.
   */
  leave(playerId: string): void {
    if (!this.seats.includes(playerId)) return;
    if (this.game.isOver()) return;

    this.absence = { id: playerId, since: this.now() };
    this.context.changed();
  }

  seated(): readonly string[] {
    return this.seats;
  }

  /**
   * Ближайшее, чего ждёт партия: конец хода или конец ожидания ушедшего.
   *
   * `null` означает «часы стоят», и платформа тогда не заводит таймер вовсе.
   * Так работает безлимитная комната: не особая ветка кода, а просто `null`
   * (src/games/chess/docs/BACKLOG.md A2).
   */
  deadline(): number | null {
    if (this.game.isOver()) return null;

    const waits: number[] = [];

    const left = this.clock.left();
    if (left !== null) waits.push(left);

    if (this.absence) {
      waits.push(Math.max(0, ABANDON_MS - (this.now() - this.absence.since)));
    }

    if (waits.length === 0) return null;

    // Наружу дедлайн уходит настенным временем: по нему клиент рисует отсчёт.
    // Считается он от монотонного остатка, а не наоборот — настенные часы
    // прыгают при синхронизации, и партия проигралась бы по флагу на ровном
    // месте.
    return Date.now() + Math.min(...waits);
  }

  /** Время вышло. Что именно вышло — разбираем здесь. */
  tick(): void {
    if (this.game.isOver()) return;

    if (this.absence && this.now() - this.absence.since >= ABANDON_MS) {
      const gone = this.colorOf(this.absence.id);
      if (gone) this.finish(this.game.abandon(gone === "white" ? "w" : "b"));
      return;
    }

    if (this.clock.expired()) {
      this.finish(this.game.flag(this.game.turn()));
    }
  }

  act(event: string, actorId: string, payload: unknown): ActionOutcome {
    if (event === GAME_EVENT.resign) return this.resign(actorId);
    if (event === GAME_EVENT.move) return this.makeMove(actorId, payload);

    return { accepted: false, reason: "Неизвестное действие" };
  }

  remove(actorId: string, targetId: string): ActionOutcome {
    if (this.context.ownerId !== actorId) {
      return { accepted: false, reason: "Выгоняет только хозяин" };
    }

    const color = this.colorOf(targetId);
    if (!color) return { accepted: true };

    // Выгнать из-за доски — то же, что уйти и не вернуться: партия достаётся
    // сопернику, а не растворяется.
    this.finish(this.game.abandon(color === "white" ? "w" : "b"));

    return { accepted: true };
  }

  snapshot(): GameRoomSnapshot {
    const outcome = this.game.outcome();
    const phase: ChessPhase = outcome
      ? "over"
      : this.seats.length < SEATS
        ? "waiting"
        : "playing";

    return {
      deadline: this.deadline(),
      phaseDurationMs: MOVE_LIMIT_MS[this.settings.timeControl],
      playerCount: this.seats.length,
      players: this.seats.map((id, at) => ({
        id,
        extra: {
          color: at === 0 ? "white" : "black",
          /** Ушёл, и его ждут: соперник должен это видеть. */
          away: this.absence?.id === id,
        },
      })),
      extra: {
        phase,
        fen: phase === "waiting" ? null : this.game.fen(),
        turn: outcome ? null : this.turnColor(),
        moves: this.game.history(),
        /** Есть ли основание требовать ничью прямо сейчас. */
        claimable: this.game.claimableDraw(),
        result: outcome?.result ?? null,
        reason: outcome?.reason ?? null,
        timeControl: this.settings.timeControl,
        streamerMode: this.settings.streamerMode,
      },
    };
  }

  settled(): Promise<void> {
    return Promise.resolve();
  }

  stop(): void {
    this.clock.stop();
  }

  /** За стол сели двое — партия пошла, часы пущены. */
  private begin(): void {
    this.startedAt = this.now();
    this.clock.restart();
  }

  private makeMove(actorId: string, payload: unknown): ActionOutcome {
    const color = this.colorOf(actorId);
    if (!color) return { accepted: false, reason: "Ты не за доской" };
    if (this.game.isOver()) {
      return { accepted: false, reason: "Партия кончилась" };
    }
    if (this.seats.length < SEATS) {
      return { accepted: false, reason: "Соперник ещё не сел" };
    }
    if (color !== this.turnColor()) {
      return { accepted: false, reason: "Сейчас не твой ход" };
    }

    const input = parseMove(payload);
    if (!input) return { accepted: false, reason: "Непонятный ход" };

    const result = this.game.move(input.move, input.ply);
    if (!result.ok) {
      return { accepted: false, reason: REJECTION_TEXT[result.reason] };
    }

    this.clock.restart();
    this.finish(result.outcome ?? this.capIfTooLong());
    // Без этого дедлайн сдвинулся бы, а будильник звонил бы по старому
    // времени. Предупреждение висит прямо в engine.ts, и платитутка на этих
    // граблях уже стояла.
    this.context.changed();

    return { accepted: true };
  }

  private resign(actorId: string): ActionOutcome {
    const color = this.colorOf(actorId);
    if (!color) return { accepted: false, reason: "Ты не за доской" };
    if (this.game.isOver()) {
      return { accepted: false, reason: "Партия кончилась" };
    }

    this.finish(this.game.resign(color === "white" ? "w" : "b"));

    return { accepted: true };
  }

  /** Партия упёрлась в потолок — по числу ходов или по времени. */
  private capIfTooLong(): Outcome | null {
    const long =
      this.game.ply() >= MAX_PLIES ||
      (this.startedAt !== null && this.now() - this.startedAt >= MAX_GAME_MS);

    return long ? this.game.capOut() : null;
  }

  /** Партия кончилась: погасить часы и рассказать платформе. */
  private finish(outcome: Outcome | null): void {
    if (!outcome) return;

    this.clock.stop();
    this.absence = null;
    this.context.emitted([{ type: "chess_finished", ...outcome }]);
    this.context.changed();
  }

  private turnColor(): ChessColor {
    return this.game.turn() === "w" ? "white" : "black";
  }

  private colorOf(playerId: string): ChessColor | null {
    const at = this.seats.indexOf(playerId);
    if (at < 0) return null;

    return at === 0 ? "white" : "black";
  }
}

/** Почему ход не принят — человеческим текстом. */
const REJECTION_TEXT: Record<string, string> = {
  gameOver: "Партия кончилась",
  notYourTurn: "Сейчас не твой ход",
  stalePly: "Этот ход уже сделан",
  needsPromotion: "Выбери, во что превратить пешку",
  illegal: "Так не ходят",
};

/** Разобрать присланное клиентом. Верить ему нельзя ни в одном поле. */
function parseMove(payload: unknown): { move: MoveInput; ply: number } | null {
  if (typeof payload !== "object" || payload === null) return null;

  const { from, to, promotion, ply } = payload as Record<string, unknown>;

  if (typeof from !== "string" || typeof to !== "string") return null;
  if (typeof ply !== "number" || !Number.isInteger(ply) || ply < 0) return null;

  const move: MoveInput = { from, to };
  if (
    promotion === "q" ||
    promotion === "r" ||
    promotion === "b" ||
    promotion === "n"
  ) {
    move.promotion = promotion;
  }

  return { move, ply };
}

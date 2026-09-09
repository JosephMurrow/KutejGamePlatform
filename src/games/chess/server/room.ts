import type {
  ActionOutcome,
  GameRoomContext,
  GameRoomSnapshot,
  GameRoomState,
} from "@/lib/games/engine";
import { GAME_EVENT, type ChessColor, type ChessPhase } from "../protocol";
import type { ChessRoomSettings } from "../rooms/store";

/**
 * Партия в одной комнате — пока заглушка, реализующая договор целиком.
 *
 * Она умеет ровно то, что нужно скелету: посадить двоих, остальных оставить
 * зрителями и отдать снимок. Правил здесь нет намеренно — они пишутся
 * отдельным этапом и без сети, чтобы их можно было покрыть тестами целиком
 * (src/games/chess/docs/PLAN.md, этап 2). Часы придут следом, вместе с
 * посадкой по-настоящему (этап 3).
 *
 * Образец договора — `src/lib/games/stub-game.test.ts`.
 */

/** За доской ровно два места. Остальные смотрят. */
const SEATS = 2;

export class ChessRoom implements GameRoomState {
  /** Сидящие в порядке посадки: первый играет белыми. */
  private readonly seats: string[] = [];

  constructor(
    private readonly context: GameRoomContext,
    private readonly settings: ChessRoomSettings,
  ) {}

  join(playerId: string): void {
    if (this.seats.includes(playerId)) return;
    // Мест два; третий и дальше остаются зрителями — за столом их нет, но в
    // комнате они есть, и снимок им приходит (src/games/chess/docs/BACKLOG.md A3).
    if (this.seats.length < SEATS) this.seats.push(playerId);
    this.context.changed();
  }

  leave(playerId: string): void {
    const at = this.seats.indexOf(playerId);
    if (at < 0) return;

    this.seats.splice(at, 1);
    this.context.changed();
  }

  seated(): readonly string[] {
    return this.seats;
  }

  /**
   * Часы стоят: лимит на ход появится вместе с правилами. Возвращать
   * `null` — это не заглушка, а рабочее состояние и потом: при контроле
   * «без ограничения» будильник не заводится вовсе.
   */
  deadline(): number | null {
    return null;
  }

  tick(): void {
    // Будить нечем: пока часов нет, платформа сюда не приходит.
  }

  act(event: string): ActionOutcome {
    if (event !== GAME_EVENT.move && event !== GAME_EVENT.resign) {
      return { accepted: false, reason: "Неизвестное действие" };
    }

    return { accepted: false, reason: "Правила ещё не написаны" };
  }

  remove(actorId: string, targetId: string): ActionOutcome {
    if (this.context.ownerId !== actorId) {
      return { accepted: false, reason: "Выгоняет только хозяин" };
    }

    this.leave(targetId);
    return { accepted: true };
  }

  // Зритель снимку пока безразличен: секретов на доске нет — позиция
  // видна всем, и прятать от экрана нечего (в отличие от платитутки).
  snapshot(): GameRoomSnapshot {
    const phase: ChessPhase = this.seats.length < SEATS ? "waiting" : "playing";

    return {
      deadline: null,
      phaseDurationMs: null,
      playerCount: this.seats.length,
      players: this.seats.map((id, at) => ({
        id,
        extra: { color: (at === 0 ? "white" : "black") satisfies ChessColor },
      })),
      // Позиции пока нет: доску рисовать ещё нечем, и врать пустой доской
      // хуже, чем честно сказать «партия не начата».
      extra: {
        phase,
        fen: null,
        turn: null,
        timeControl: this.settings.timeControl,
        streamerMode: this.settings.streamerMode,
      },
    };
  }

  settled(): Promise<void> {
    return Promise.resolve();
  }

  stop(): void {
    // Гасить нечего: таймеров у заглушки нет.
  }
}

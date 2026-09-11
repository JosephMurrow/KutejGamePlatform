import type {
  ActionOutcome,
  GameRoomContext,
  GameRoomSnapshot,
  GameRoomState,
} from "@/lib/games/engine";
import { modeInfo } from "../modes/catalog";
import type { TurboPhase } from "../protocol";
import type { TurboRoomSettings } from "../rooms/settings";

/**
 * Стол в приватной комнате — пока заглушка, реализующая договор целиком.
 *
 * Умеет ровно то, что нужно скелету: посадить столько, сколько мест в режиме,
 * остальных оставить зрителями и отдать снимок. Правил здесь нет намеренно:
 * свой движок пишется отдельным этапом и без сети, чтобы его можно было
 * покрыть тестами целиком (docs/PLAN.md, этап 3), а партия по сети приходит на
 * этапе 5. Так же начинались шахматы.
 *
 * Образец договора — `src/lib/games/stub-game.test.ts`.
 */
export class TurboRoom implements GameRoomState {
  /** Сидящие в порядке посадки: место за столом — это индекс. */
  private readonly seats: string[] = [];
  /** Мест два, в королевской битве — четыре. Остальные смотрят. */
  private readonly capacity: number;

  constructor(
    private readonly context: GameRoomContext,
    private readonly settings: TurboRoomSettings,
  ) {
    this.capacity = modeInfo(settings.mode).seats;
  }

  join(playerId: string): void {
    if (this.seats.includes(playerId)) return;
    // Лишние остаются зрителями: за столом их нет, но в комнате они есть, и
    // снимок им приходит. Лимит держит движок, а не платформенное
    // `maxPlayers` — тот отбил бы само подключение, и зритель получил бы «нет
    // свободных мест» (так же решено у шахмат).
    if (this.seats.length < this.capacity) this.seats.push(playerId);
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

  /** Часы стоят: ходить пока нечем, будильник не нужен. */
  deadline(): number | null {
    return null;
  }

  tick(): void {
    // Будить нечем: пока часов нет, платформа сюда не приходит.
  }

  /**
   * Платформа зовёт сюда только события из `GAME_EVENT`, а их пока нет. Отказ
   * всё равно внятный — на случай, если действие появится в протоколе раньше,
   * чем в движке.
   */
  act(): ActionOutcome {
    return { accepted: false, reason: "Партия ещё не готова" };
  }

  remove(actorId: string, targetId: string): ActionOutcome {
    if (this.context.ownerId !== actorId) {
      return { accepted: false, reason: "Выгоняет только хозяин" };
    }

    this.leave(targetId);
    return { accepted: true };
  }

  // Зритель снимку пока безразличен: секретов у заглушки нет. Появятся они с
  // «двойным агентом» и «вскрываемся» — там снимок станет разным для разных
  // глаз (docs/MODES.md, режимы 10 и 16).
  snapshot(): GameRoomSnapshot {
    const phase: TurboPhase =
      this.seats.length < this.capacity ? "waiting" : "ready";

    return {
      deadline: null,
      phaseDurationMs: null,
      playerCount: this.seats.length,
      players: this.seats.map((id, seat) => ({ id, extra: { seat } })),
      extra: { phase, mode: this.settings.mode, seats: this.capacity },
    };
  }

  settled(): Promise<void> {
    return Promise.resolve();
  }

  stop(): void {
    // Гасить нечего: таймеров у заглушки нет.
  }
}

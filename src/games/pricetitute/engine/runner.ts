import type { ActionResult, GameEvent, Room, RoomView } from "./room";

/**
 * Применение ходов: выполняет действие, собирает события и отдаёт их наружу
 * вместе со свежим состоянием.
 *
 * Часов здесь больше нет. Движок сам по себе безвременной — он объявляет
 * дедлайн фазы, а будильник по нему заводит платформа и будит движок вызовом
 * `tick` (docs/BACKLOG.md A3). Так все таймеры процесса видны в одном месте, и
 * гасятся они тоже там.
 */
export type ChangeListener = (events: GameEvent[], view: RoomView) => void;

export class RoomRunner {
  private stopped = false;

  constructor(
    readonly room: Room,
    private readonly onChange: ChangeListener,
    /** Источник времени; подменяется в тестах. */
    private readonly clock: () => number = Date.now,
  ) {}

  /**
   * Выполнить действие игрока и разослать состояние. Отклонённые действия
   * ничего не рассылают — ответ уходит только автору.
   */
  run(action: (room: Room, now: number) => ActionResult): ActionResult {
    if (this.stopped) {
      return { accepted: false, reason: "Комната закрыта", events: [] };
    }

    const result = action(this.room, this.clock());
    if (result.accepted) this.publish(result.events);

    return result;
  }

  /** Время вышло: двигаем состояние и рассылаем, что из этого вышло. */
  tick(now: number): void {
    if (this.stopped) return;
    this.publish(this.room.tick(now));
  }

  stop(): void {
    this.stopped = true;
  }

  private publish(events: GameEvent[]): void {
    this.onChange(events, this.room.view());
  }
}

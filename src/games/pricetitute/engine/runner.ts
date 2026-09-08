import type { ActionResult, GameEvent, Room, RoomView } from "./room";

/**
 * Часовой механизм комнаты: единственное место, где живёт setTimeout.
 *
 * Движок сам по себе безвременной — он только объявляет дедлайн фазы. Раннер
 * заводит таймер до этого дедлайна, дёргает `tick` и отдаёт наружу события
 * вместе со свежим состоянием, чтобы транспорт разослал его игрокам.
 */
export type ChangeListener = (events: GameEvent[], view: RoomView) => void;

export class RoomRunner {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    readonly room: Room,
    private readonly onChange: ChangeListener,
    /** Источник времени; подменяется в тестах. */
    private readonly clock: () => number = Date.now,
  ) {}

  /**
   * Выполнить действие игрока, перевести таймер и разослать состояние.
   * Отклонённые действия ничего не рассылают — ответ уходит только автору.
   */
  run(action: (room: Room, now: number) => ActionResult): ActionResult {
    const result = action(this.room, this.clock());
    if (result.accepted) this.publish(result.events);
    return result;
  }

  /** Завести таймер по текущему состоянию: вызывается при создании комнаты. */
  start(): void {
    this.stopped = false;
    this.reschedule();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  private publish(events: GameEvent[]): void {
    this.reschedule();
    this.onChange(events, this.room.view());
  }

  private reschedule(): void {
    this.clearTimer();
    if (this.stopped) return;

    const { deadline } = this.room.view();
    if (deadline === null) return;

    const delay = Math.max(0, deadline - this.clock());
    this.timer = setTimeout(() => this.fire(), delay);
    // Комната не должна удерживать процесс живым сама по себе.
    this.timer.unref?.();
  }

  private fire(): void {
    this.timer = null;
    if (this.stopped) return;

    const events = this.room.tick(this.clock());
    this.publish(events);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}

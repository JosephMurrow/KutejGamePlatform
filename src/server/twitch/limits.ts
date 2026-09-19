import { MAX_PLAYERS_LIMIT } from "../../shared/room-settings";
import { RateLimiter } from "../rate-limit";

/**
 * Лимиты моста в Твич (docs/SECURITY.md, S-F1).
 *
 * Канал в комнату вписывает кто угодно, и чужой канал на десятки тысяч
 * зрителей превращает каждую `!ставку` нового зрителя в запись в базе. Поэтому
 * мост держат три потолка:
 *
 * - **каналов на процесс** — сколько чатов сервер слушает одновременно;
 * - **зрителей за столом в комнате** — тот же потолок, что у гостей по ссылке
 *   (S-D3): зрители из чата — те же гости, со своими строками в базе;
 * - **новых посадок в минуту на комнату** — лавина с большого канала садится
 *   порциями, а не разом.
 *
 * Действия уже сидящего зрителя придушены паузой в самом мосте — не чаще
 * одного разбора команды в полторы секунды.
 */

export interface TwitchLimitSettings {
  channels: number;
  seatsPerRoom: number;
  seatsPerMinute: number;
}

export const TWITCH_LIMITS: TwitchLimitSettings = {
  channels: 20,
  // То же число, что потолок гостей по ссылке (MAX_GUESTS_PER_ROOM).
  seatsPerRoom: MAX_PLAYERS_LIMIT,
  seatsPerMinute: 30,
};

export class TwitchLimits {
  private readonly seating: RateLimiter;

  constructor(private readonly settings: TwitchLimitSettings = TWITCH_LIMITS) {
    this.seating = new RateLimiter(settings.seatsPerMinute, 60_000);
  }

  /** Можно ли подключить ещё один канал. */
  canAttach(listening: number): boolean {
    return listening < this.settings.channels;
  }

  /**
   * Можно ли посадить ещё одного зрителя. `true` — можно, и посадка
   * засчитана минутному потолку комнаты.
   */
  canSeat(roomKey: string, seated: number, now = Date.now()): boolean {
    if (seated >= this.settings.seatsPerRoom) return false;
    return this.seating.allow(roomKey, now);
  }

  /** Комната закрылась — её счётчик больше не нужен. */
  forget(roomKey: string): void {
    this.seating.forget(roomKey);
  }
}

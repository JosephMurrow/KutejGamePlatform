import type {
  GameRoomContext,
  GameRoomState,
  GameServer,
} from "@/lib/games/engine";
import { defaultRoomSettings, type TurboRoomSettings } from "../rooms/settings";
import { saveMatch } from "../rooms/matches";
import { ClosedHall } from "./hall";
import { TurboRoom, type MatchDraft } from "./room";

/**
 * Серверная часть турбо-шахмат: живые столы и всё, что игра держит у себя на
 * весь срок жизни процесса. Пока держать нечего — соперник-программа появится
 * на своём этапе (docs/PLAN.md, этап 11).
 */
class TurboServer implements GameServer {
  private readonly rooms = new Map<string, GameRoomState>();

  createRoom(context: GameRoomContext): Promise<GameRoomState> {
    // Общего зала у игры нет: за его ключом — закрытая дверь.
    if (!context.isPrivate) return Promise.resolve(new ClosedHall());

    // Настройки приносит платформа — той формы, какой их отдал наш серверный
    // манифест. Если комната старее настроек, играем умолчанием.
    const settings = (context.settings ??
      defaultRoomSettings()) as TurboRoomSettings;

    const room = new TurboRoom(context, settings, undefined, record);
    this.rooms.set(context.key, room);

    return Promise.resolve(room);
  }

  closeRoom(key: string): void {
    this.rooms.delete(key);
  }

  stop(): void {
    this.rooms.clear();
  }
}

/**
 * Записать партию. Сбой базы партию не роняет: игроки уже увидели итог, а
 * потерянная запись — строчка в логе, а не пятисотка посреди стола.
 */
function record(draft: MatchDraft): void {
  saveMatch(draft).catch((error: unknown) => {
    console.error("Не удалось записать партию турбо-шахмат:", error);
  });
}

/**
 * Ведущего платформа даёт для чата от имени ботов — нам он понадобится
 * вместе с ними (docs/PLAN.md, этап 11), а пока не берём.
 */
export function createTurboServer(): GameServer {
  return new TurboServer();
}

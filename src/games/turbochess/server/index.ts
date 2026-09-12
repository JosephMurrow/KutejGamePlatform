import type {
  GameRoomContext,
  GameRoomState,
  GameServer,
} from "@/lib/games/engine";
import { makeBots } from "../bots/seat";
import {
  botRoom,
  defaultRoomSettings,
  type TurboRoomSettings,
} from "../rooms/settings";
import { saveMatch } from "../rooms/matches";
import { ClosedHall } from "./hall";
import { TurboRoom, type MatchDraft } from "./room";

/**
 * Серверная часть турбо-шахмат: живые столы и всё, что игра держит у себя на
 * весь срок жизни процесса.
 *
 * Боты живут в самой комнате, а не здесь: своего процесса, как у шахматного
 * Стокфиша, им не нужно — перебор у нас свой и считается в том же потоке за
 * миллисекунды (docs/BOTS.md).
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

    // Запас ботов на комнату: по одному на каждое место, кроме последнего —
    // оно всегда остаётся человеку. Садятся не все, а сколько просили в форме;
    // остальные ждут кнопки «позвать бота» (docs/BOTS.md, А6).
    const pool = makeBots(
      botRoom(settings.mode),
      settings.botLevel,
      seedFor(context.key),
    );

    const room = new TurboRoom(context, settings, undefined, record, pool);
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
 * Зерно для выбора характеров: своё у каждой комнаты и постоянное, пока она
 * жива. Зерно партии тут не годится — оно меняется с каждым реваншем, и за
 * столом после него оказались бы другие боты.
 */
function seedFor(key: string): number {
  let hash = 0x811c9dc5;
  for (let at = 0; at < key.length; at++) {
    hash = Math.imul(hash ^ key.charCodeAt(at), 0x01000193) >>> 0;
  }
  return hash % 2 ** 31;
}

/**
 * Ведущего платформа даёт для чата от имени ботов — он понадобится, когда боты
 * заговорят (docs/BOTS.md, подэтап 13г), а пока не берём.
 */
export function createTurboServer(): GameServer {
  return new TurboServer();
}

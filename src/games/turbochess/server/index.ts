import { randomUUID } from "node:crypto";
import type {
  GameHost,
  GameRoomContext,
  GameRoomState,
  GameServer,
} from "@/lib/games/engine";
import { linesOf } from "../bots/lines";
import type { Moment } from "../bots/moments";
import { makeBots, type BotSeat } from "../bots/seat";
import { Talker, typingMs } from "../bots/talk";
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
  /** Реплики, которые ещё «печатаются»: при остановке сервера их гасим. */
  private readonly typing = new Set<ReturnType<typeof setTimeout>>();

  constructor(private readonly host?: GameHost) {}

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

    const room = new TurboRoom(
      context,
      settings,
      undefined,
      record,
      pool.map((bot) => this.voiced(bot, context.key)),
    );
    this.rooms.set(context.key, room);

    return Promise.resolve(room);
  }

  closeRoom(key: string): void {
    this.rooms.delete(key);
  }

  stop(): void {
    for (const pending of this.typing) clearTimeout(pending);
    this.typing.clear();
    this.rooms.clear();
  }

  /**
   * Дать боту голос.
   *
   * Комната зовёт `speak` и о задержке ничего не знает: реплика уходит в чат не
   * сразу, а через «печатает» — мгновенный ответ выдаёт программу так же, как
   * мгновенный ход. Таймер живёт здесь, а не в комнате: чат — не состояние
   * партии, и потерять реплику при перезапуске не страшно, а второй источник
   * времени внутри комнаты сломал бы её воспроизводимость.
   */
  private voiced(bot: BotSeat, roomKey: string): BotSeat {
    const host = this.host;
    if (!host) return bot;

    const talker = new Talker(linesOf(bot.character));

    return {
      ...bot,
      speak: (moment: Moment, ply: number) => {
        const line = talker.say(moment, ply);
        if (!line) return;

        const pending = setTimeout(() => {
          this.typing.delete(pending);
          host.sendChat(roomKey, {
            id: randomUUID(),
            playerId: bot.id,
            nickname: bot.nickname,
            avatarId: bot.avatarId,
            text: line,
            at: Date.now(),
          });
        }, typingMs(line));

        this.typing.add(pending);
      },
      restart: () => talker.restart(),
    };
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
 * Ведущего платформа даёт для чата от имени ботов: через него уходят их
 * реплики. Без него игра работает — боты просто молчат.
 */
export function createTurboServer(host?: GameHost): GameServer {
  return new TurboServer(host);
}

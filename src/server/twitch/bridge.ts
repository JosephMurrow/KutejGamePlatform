import { randomAvatarId } from "../../lib/avatars";
import { prisma } from "../../lib/prisma";
import { checkNickname } from "../../shared/guest";
import {
  parseCommand,
  twitchLogin,
  twitchNickname,
  type TwitchCommand,
} from "../../shared/twitch";
import type { RoomManager } from "../rooms";
import { ChatReader, normalizeChannel, type TwitchMessage } from "./chat";

/**
 * Мост между чатом Твича и столом.
 *
 * Зритель пишет `!10000` — ставка доезжает до комнаты и попадает в таблицу под
 * его ником. Ничего, кроме имени канала, для этого не нужно: чтение чата
 * анонимно (см. src/games/pricetitute/docs/BACKLOG.md P1).
 *
 * Личность берётся из тега `user-id`: он числовой и стабильный, а ник зритель
 * может поменять когда угодно. На него заводится обычный гость комнаты — тот
 * же, что и у входа по ссылке, и живёт он ровно столько же.
 *
 * Отвечать в чат мост пока не умеет: отправка требует регистрации приложения и
 * OAuth, и это отдельный этап. Команды `!вопрос` и `!топ` разбираются, но
 * молчат — до него.
 */

/** Не чаще одного разбора команд на зрителя в эту паузу. */
const COOLDOWN_MS = 1_500;

interface Seat {
  /** Наш идентификатор игрока. */
  userId: string;
  nickname: string;
  lastActedAt: number;
}

interface Attachment {
  channel: string;
  reader: ChatReader;
  /** Зрители за столом: ключ — `user-id` Твича. */
  seats: Map<string, Seat>;
  connected: boolean;
}

export class TwitchBridge {
  private readonly rooms = new Map<string, Attachment>();

  constructor(
    private readonly manager: RoomManager,
    /** Разослать свежее состояние комнаты: ставка из чата меняет стол. */
    private readonly broadcast: (roomKey: string) => void,
  ) {}

  /** Слушает ли комната какой-нибудь канал. */
  channelOf(roomKey: string): string | null {
    return this.rooms.get(roomKey)?.channel ?? null;
  }

  connected(roomKey: string): boolean {
    return this.rooms.get(roomKey)?.connected ?? false;
  }

  /**
   * Подключить комнату к каналу. Повторный вызов с тем же каналом ничего не
   * делает: комнату поднимают на каждом входе, а переподключаться из-за этого
   * незачем.
   */
  attach(roomKey: string, rawChannel: string): void {
    const channel = normalizeChannel(rawChannel);
    if (channel === null) return;

    const existing = this.rooms.get(roomKey);
    if (existing?.channel === channel) return;
    if (existing) this.detach(roomKey);

    const attachment: Attachment = {
      channel,
      seats: new Map(),
      connected: false,
      reader: new ChatReader({
        channel,
        onMessage: (message) => {
          void this.onMessage(roomKey, message).catch((error: unknown) => {
            console.error(`[twitch ${channel}] сообщение упало:`, error);
          });
        },
        onStatus: (connected) => {
          const room = this.rooms.get(roomKey);
          if (!room) return;

          room.connected = connected;
          this.broadcast(roomKey);
        },
      }),
    };

    this.rooms.set(roomKey, attachment);
    attachment.reader.start();

    console.log(`[twitch ${channel}] слушаем чат для комнаты ${roomKey}`);
  }

  /** Отключить комнату от канала и убрать её зрителей из-за стола. */
  detach(roomKey: string): void {
    const attachment = this.rooms.get(roomKey);
    if (!attachment) return;

    attachment.reader.stop();
    this.rooms.delete(roomKey);

    const managed = this.manager.get(roomKey);
    if (!managed) return;

    for (const seat of attachment.seats.values()) {
      managed.profiles.delete(seat.userId);
      managed.runner.run((room, at) => room.leave(seat.userId, at));
    }
  }

  stop(): void {
    for (const roomKey of [...this.rooms.keys()]) this.detach(roomKey);
  }

  private async onMessage(
    roomKey: string,
    message: TwitchMessage,
  ): Promise<void> {
    const attachment = this.rooms.get(roomKey);
    const managed = this.manager.get(roomKey);
    if (!attachment || !managed) return;

    const command = parseCommand(message.text);
    if (command === null) return;

    const now = Date.now();
    const seat = attachment.seats.get(message.userId);

    // Заклинившая кнопка и скрипт-спамер придушиваются тем же способом, что и
    // в сокете: не чаще одного действия в полторы секунды на зрителя.
    if (seat && now - seat.lastActedAt < COOLDOWN_MS) return;
    if (seat) seat.lastActedAt = now;

    switch (command.kind) {
      case "join":
        await this.seat(roomKey, message);
        break;

      case "leave":
        this.unseat(roomKey, message.userId);
        break;

      case "bet": {
        // Ставка сама сажает за стол: заставлять зрителя писать `!я` перед
        // первой ставкой — верный способ потерять половину чата.
        const player = seat ?? (await this.seat(roomKey, message));
        if (!player) return;

        managed.runner.run((room, at) =>
          room.placeBet(player.userId, command.bet, at),
        );
        break;
      }

      // Отвечать в чат мост пока не умеет: это отдельный этап с OAuth.
      case "question":
      case "top":
        return;
    }

    this.broadcast(roomKey);
  }

  /** Посадить зрителя за стол. Гость заводится один раз и живёт с комнатой. */
  private async seat(
    roomKey: string,
    message: TwitchMessage,
  ): Promise<Seat | null> {
    const attachment = this.rooms.get(roomKey);
    const managed = this.manager.get(roomKey);
    if (!attachment || !managed) return null;

    const existing = attachment.seats.get(message.userId);
    if (existing) return existing;

    // Замок и лимит комнаты действуют и на чат: закрыл набор — значит закрыл.
    if (managed.locked) return null;
    const limit = managed.maxPlayers;
    if (limit !== null && managed.room.view().players.length >= limit) {
      return null;
    }

    const raw = twitchNickname(message.displayName, message.login);
    // Ник приезжает с Твича, а показывается на нашем экране: правила те же,
    // что и для гостя по ссылке. Не прошёл — играет под логином.
    const nickname =
      checkNickname(raw) === null ? raw : `Зритель ${raw.slice(0, 4)}`;

    const login = twitchLogin(message.userId);
    const avatarId = randomAvatarId();

    const user = await prisma.user.upsert({
      where: { login },
      create: {
        login,
        passwordHash: "-",
        nickname,
        avatarId,
        isGuest: true,
        guestRoomId: roomKey,
        adultConfirmedAt: new Date(),
      },
      update: { nickname, guestRoomId: roomKey, isGuest: true },
      select: { id: true, avatarId: true },
    });

    const seat: Seat = { userId: user.id, nickname, lastActedAt: Date.now() };
    attachment.seats.set(message.userId, seat);

    managed.profiles.set(user.id, {
      id: user.id,
      guestRoomId: roomKey,
      nickname,
      avatarId: user.avatarId,
    });
    managed.runner.run((room, at) => room.join(user.id, at));

    return seat;
  }

  private unseat(roomKey: string, twitchUserId: string): void {
    const attachment = this.rooms.get(roomKey);
    const managed = this.manager.get(roomKey);
    if (!attachment || !managed) return;

    const seat = attachment.seats.get(twitchUserId);
    if (!seat) return;

    attachment.seats.delete(twitchUserId);
    managed.profiles.delete(seat.userId);
    managed.runner.run((room, at) => room.leave(seat.userId, at));
  }
}

export type { TwitchCommand };

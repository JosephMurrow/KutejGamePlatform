import type {
  GameRoomEvent,
  GameRoomState,
  GameServer,
  RoomProfile,
} from "@/lib/games/engine";
import type { ChatMessagePayload } from "../shared/protocol";
import { CHAT_HISTORY_SIZE } from "../shared/protocol";
import type { RoomKind } from "../shared/room-settings";
import {
  deletePrivateRoom,
  markBusy,
  markEmpty,
  staleRoomIds,
} from "../lib/rooms/private";
import type { SocketUser } from "./auth";

/**
 * Кадр рассылки. Раньше снимок уходил на каждое принятое действие, и двести
 * зрителей, ставящих одновременно, давали двести рассылок по двести сокетов.
 * Склейка в кадр превращает это в десяток рассылок в секунду и незаметна:
 * фазы живут секундами, а не миллисекундами (см. src/games/pricetitute/docs/BACKLOG.md N4).
 */
const BROADCAST_FRAME_MS = 100;

/**
 * С чем поднимать комнату. Всё здесь платформенное, кроме `settings`: их
 * собирает сама игра, и платформа только передаёт их дальше.
 */
export interface RoomSetup {
  /** Во что тут играют. */
  gameId: string;
  /** Приватные комнаты умирают, когда опустеют; общая живёт всегда. */
  isPrivate: boolean;
  /** Какого рода комната. У общего зала экрана нет, отсюда `private`. */
  kind: RoomKind;
  /** Название комнаты: рисуется на экране. */
  title: string | null;
  /** Хозяин комнаты; в общем зале — null. */
  ownerId: string | null;
  /** Набор закрыт: новых за стол не пускают. */
  locked: boolean;
  /** Больше этого числа за стол не сажаем. null — без ограничения. */
  maxPlayers: number | null;
  /** Канал Твича, чей чат слушает комната. */
  twitchChannel: string | null;
  /** Настройки партии глазами игры. Платформа внутрь не смотрит. */
  settings: unknown;
}

export interface ManagedRoom {
  key: string;
  setup: RoomSetup;
  /** Партия: всё, что происходит по правилам, делает она. */
  game: GameRoomState;
  chat: ChatMessagePayload[];
  /** Кто за столом: ники и аватары. */
  profiles: Map<string, RoomProfile>;
  /** Сколько вкладок открыто у каждого игрока. */
  connections: Map<string, number>;
  /**
   * Подключённые экраны, по идентификатору сокета. За столом их нет, но пока
   * хоть один смотрит, комната считается занятой: иначе стример, оставивший
   * открытым только источник OBS, через полчаса обнаружил бы, что комнаты нет.
   */
  screens: Set<string>;
  /** Закрыт ли набор. Хозяин щёлкает этим на ходу, поэтому не в setup. */
  locked: boolean;
  /** Потолок числа игроков. */
  maxPlayers: number | null;
}

export type Broadcast = (room: ManagedRoom) => void;

/** Где взять серверную часть игры по её коду. */
export type GameServers = (gameId: string) => GameServer;

/**
 * Сколько ждать перед тем, как убрать отключившегося из круга. Без этой паузы
 * обновление страницы стоило бы игроку места в очереди ходов: он вышел бы и
 * тут же вернулся в самый конец.
 */
const DISCONNECT_GRACE_MS = 15_000;

/** Профиль игрока глазами комнаты: столько платформа о нём и знает. */
function profileOf(user: SocketUser): RoomProfile {
  return {
    id: user.id,
    nickname: user.nickname,
    avatarId: user.avatarId,
    isGuest: user.guestRoomId != null,
  };
}

/**
 * Живые комнаты процесса. Состояние партии держит игра, платформа — состав,
 * чат, подключения и срок жизни комнаты.
 */
export class RoomManager {
  private readonly rooms = new Map<string, ManagedRoom>();
  private readonly opening = new Map<string, Promise<ManagedRoom>>();
  /** Отложенные выходы: ключ — комната и игрок. */
  private readonly leaving = new Map<string, ReturnType<typeof setTimeout>>();
  /** Отложенные рассылки: ключ — комната. */
  private readonly framed = new Map<string, ReturnType<typeof setTimeout>>();
  /** Когда по комнате рассылали в последний раз. */
  private readonly lastSent = new Map<string, number>();
  /**
   * Будильники партий: по одному на комнату. Все таймеры процесса живут здесь,
   * поэтому и гасятся здесь же — движок только объявляет, когда его будить
   * (docs/BACKLOG.md A3).
   */
  private readonly clocks = new Map<string, ReturnType<typeof setTimeout>>();
  /**
   * Кому пересказывать события партий. Список, а не слот: подписчиков может
   * быть сколько угодно — лог, метрики, всё, что захочет знать о ходе игры,
   * не заглядывая внутрь правил.
   */
  private readonly eventListeners = new Set<
    (roomKey: string, events: readonly GameRoomEvent[]) => void
  >();
  /**
   * Кого позвать, когда комнату гасят. Подписан мост в чат Твича: держать
   * подключение к каналу удалённой комнаты незачем.
   *
   * Список, а не один слот: раньше сюда присваивались, и второй подписчик
   * молча затирал первого (docs/BACKLOG.md A3).
   */
  private readonly closeListeners = new Set<(roomKey: string) => void>();

  constructor(
    private readonly broadcast: Broadcast,
    private readonly servers: GameServers,
  ) {}

  /** Игрок подключился. Первая вкладка сажает его за стол. */
  async join(
    user: SocketUser,
    key: string,
    setup: RoomSetup,
  ): Promise<ManagedRoom> {
    const managed = await this.acquire(key, setup);

    // Вернулся раньше, чем истекла отсрочка — значит и не уходил.
    this.cancelLeave(key, user.id);

    managed.profiles.set(user.id, profileOf(user));
    const tabs = (managed.connections.get(user.id) ?? 0) + 1;
    managed.connections.set(user.id, tabs);

    if (tabs === 1) managed.game.join(user.id);

    if (setup.isPrivate) void markBusy(key).catch(logFailure(key, "занятость"));

    return managed;
  }

  /**
   * Пускают ли ещё за стол. `null` — пускают, строка — причина отказа.
   *
   * Хозяин и те, кто уже сидит, проходят всегда: замок закрывает набор, а не
   * выкидывает игроков из идущей партии.
   */
  async admits(
    user: SocketUser,
    key: string,
    setup: RoomSetup,
  ): Promise<string | null> {
    const managed = await this.acquire(key, setup);
    const seated = managed.game.seated();

    if (managed.setup.ownerId === user.id) return null;
    if (seated.includes(user.id)) return null;

    if (managed.locked) return "Хозяин закрыл набор в эту комнату";

    const limit = managed.maxPlayers;
    if (limit !== null && seated.length >= limit) {
      return "В комнате нет свободных мест";
    }

    return null;
  }

  /**
   * Экран подключился. Комната поднимается, но за стол никто не садится: экран
   * только смотрит, ходов не получает и в составе не появляется.
   */
  async watch(
    socketId: string,
    key: string,
    setup: RoomSetup,
  ): Promise<ManagedRoom> {
    const managed = await this.acquire(key, setup);
    managed.screens.add(socketId);

    if (setup.isPrivate) void markBusy(key).catch(logFailure(key, "занятость"));

    return managed;
  }

  /** Экран отключился. */
  unwatch(socketId: string, key: string): void {
    const managed = this.rooms.get(key);
    if (!managed) return;

    managed.screens.delete(socketId);
    this.checkEmpty(managed);
  }

  /**
   * Никого не осталось — ни за столом, ни у экрана. С этого момента
   * отсчитывается получасовой срок жизни приватной комнаты.
   */
  private checkEmpty(managed: ManagedRoom): void {
    if (!managed.setup.isPrivate) return;
    if (managed.connections.size > 0 || managed.screens.size > 0) return;

    void markEmpty(managed.key, new Date()).catch(
      logFailure(managed.key, "опустение"),
    );
  }

  /**
   * Игрок отключился. Из-за стола выходит, только когда закрыл все вкладки,
   * и то не сразу: короткая отсрочка переживает обновление страницы.
   */
  leave(user: SocketUser, key: string): void {
    const managed = this.rooms.get(key);
    if (!managed) return;

    const tabs = (managed.connections.get(user.id) ?? 1) - 1;

    if (tabs > 0) {
      managed.connections.set(user.id, tabs);
      return;
    }

    managed.connections.delete(user.id);

    const pendingKey = leaveKey(key, user.id);
    if (this.leaving.has(pendingKey)) return;

    const timer = setTimeout(() => {
      this.leaving.delete(pendingKey);
      this.rooms.get(key)?.game.leave(user.id);
    }, DISCONNECT_GRACE_MS);
    timer.unref?.();

    this.leaving.set(pendingKey, timer);

    this.checkEmpty(managed);
  }

  private cancelLeave(key: string, userId: string): void {
    const pendingKey = leaveKey(key, userId);
    const timer = this.leaving.get(pendingKey);
    if (!timer) return;

    clearTimeout(timer);
    this.leaving.delete(pendingKey);
  }

  /** Подписаться на события партий. Возвращает функцию отписки. */
  onEvents(
    listener: (roomKey: string, events: readonly GameRoomEvent[]) => void,
  ): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Подписаться на закрытие комнат. Возвращает функцию отписки. */
  onClose(listener: (roomKey: string) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  get(key: string): ManagedRoom | undefined {
    return this.rooms.get(key);
  }

  /** Погасить комнату: приватную после удаления, все — при остановке сервера. */
  close(key: string): void {
    const managed = this.rooms.get(key);
    if (!managed) return;

    for (const [pendingKey, timer] of this.leaving) {
      if (pendingKey.startsWith(`${key}\0`)) {
        clearTimeout(timer);
        this.leaving.delete(pendingKey);
      }
    }

    const clock = this.clocks.get(key);
    if (clock) clearTimeout(clock);
    this.clocks.delete(key);

    const framed = this.framed.get(key);
    if (framed) clearTimeout(framed);
    this.framed.delete(key);
    this.lastSent.delete(key);

    managed.game.stop();
    this.servers(managed.setup.gameId).closeRoom?.(key);
    this.rooms.delete(key);
    for (const listener of this.closeListeners) {
      try {
        listener(key);
      } catch (error) {
        console.error(`[room ${key}] подписчик закрытия упал:`, error);
      }
    }
  }

  closeAll(): void {
    for (const key of [...this.rooms.keys()]) this.close(key);
  }

  private async acquire(key: string, setup: RoomSetup): Promise<ManagedRoom> {
    const existing = this.rooms.get(key);
    if (existing) return existing;

    // Два одновременных подключения не должны поднять комнату дважды.
    const opening = this.opening.get(key);
    if (opening) return opening;

    const promise = this.open(key, setup).finally(() => {
      this.opening.delete(key);
    });
    this.opening.set(key, promise);

    return promise;
  }

  private async open(key: string, setup: RoomSetup): Promise<ManagedRoom> {
    const managed: ManagedRoom = {
      key,
      setup,
      // Партия появляется следом: движку нужен контекст, а контексту — сама
      // комната. Ссылку доставляем сразу после создания.
      game: null as unknown as GameRoomState,
      chat: [],
      profiles: new Map(),
      connections: new Map(),
      screens: new Set(),
      locked: setup.locked,
      maxPlayers: setup.maxPlayers,
    };

    managed.game = await this.servers(setup.gameId).createRoom({
      key,
      ownerId: setup.ownerId,
      isPrivate: setup.isPrivate,
      settings: setup.settings,
      connections: () => managed.connections.size,
      introduce: (profile) => {
        managed.profiles.set(profile.id, profile);
      },
      forget: (playerId) => {
        managed.profiles.delete(playerId);
      },
      emitted: (events) => {
        for (const listener of this.eventListeners) {
          try {
            listener(key, events);
          } catch (error) {
            console.error(`[room ${key}] подписчик событий упал:`, error);
          }
        }
      },
      changed: () => {
        if (!this.rooms.has(key)) return;
        // Ход мог сдвинуть дедлайн — переводим будильник, потом рассылаем.
        this.arm(managed);
        this.frame(managed);
      },
    });

    this.rooms.set(key, managed);
    this.arm(managed);

    return managed;
  }

  /**
   * Перевести будильник партии на её следующий дедлайн. Дедлайн абсолютный,
   * поэтому переводить можно сколько угодно раз — сработает он в своё время.
   */
  private arm(managed: ManagedRoom): void {
    const key = managed.key;

    const existing = this.clocks.get(key);
    if (existing) clearTimeout(existing);
    this.clocks.delete(key);

    const deadline = managed.game.deadline();
    if (deadline === null) return;

    const timer = setTimeout(
      () => {
        this.clocks.delete(key);
        if (!this.rooms.has(key)) return;

        // Движок сам решит, что значит «время вышло», и позовёт changed —
        // тогда будильник переведётся на следующую фазу.
        managed.game.tick(Date.now());
      },
      Math.max(0, deadline - Date.now()),
    );
    // Комната не должна удерживать процесс живым сама по себе.
    timer.unref?.();

    this.clocks.set(key, timer);
  }

  /**
   * Рассылка кадром: первая уходит сразу, частые следом склеиваются в одну.
   * Ждать сотню миллисекунд с первым снимком незачем — смена фазы должна
   * доезжать мгновенно.
   */
  private frame(managed: ManagedRoom): void {
    const key = managed.key;
    if (this.framed.has(key)) return;

    const since = Date.now() - (this.lastSent.get(key) ?? 0);
    if (since >= BROADCAST_FRAME_MS) {
      this.lastSent.set(key, Date.now());
      this.broadcast(managed);
      return;
    }

    const timer = setTimeout(() => {
      this.framed.delete(key);
      this.lastSent.set(key, Date.now());
      if (this.rooms.has(key)) this.broadcast(managed);
    }, BROADCAST_FRAME_MS - since);
    timer.unref?.();

    this.framed.set(key, timer);
  }
}

/** Подмести опустевшие приватные комнаты: получасовой срок вышел. */
export async function sweepStaleRooms(manager: RoomManager): Promise<void> {
  for (const roomId of await staleRoomIds(new Date())) {
    manager.close(roomId);
    await deletePrivateRoom(roomId);
    console.log(`[room ${roomId}] удалена: пустовала полчаса`);
  }
}

/** Обёртка, чтобы фоновая отметка в базе не роняла обработчик сокета. */
function logFailure(key: string, what: string) {
  return (error: unknown) => {
    console.error(`[room ${key}] не записал ${what}:`, error);
  };
}

/** Ключ отложенного выхода: ни ключ комнаты, ни id игрока пробелов не содержат. */
function leaveKey(roomKey: string, userId: string): string {
  return `${roomKey}\0${userId}`;
}

/** Добавить сообщение в кольцевой буфер чата комнаты. */
export function pushChat(
  managed: ManagedRoom,
  message: ChatMessagePayload,
): void {
  managed.chat.push(message);
  if (managed.chat.length > CHAT_HISTORY_SIZE) {
    managed.chat.splice(0, managed.chat.length - CHAT_HISTORY_SIZE);
  }
}

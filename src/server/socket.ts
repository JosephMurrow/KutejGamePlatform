import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { Server as IOServer, type Socket } from "socket.io";
import type { GameServer, GameViewer } from "@/lib/games/engine";
import {
  defaultGameServer,
  gameServerById,
  GAME_SERVERS,
} from "@/lib/games/servers";
import { renameGuest } from "../lib/auth/guest";
import { findPrivateRoom, setRoomLocked } from "../lib/rooms/private";
import { checkNickname } from "../shared/guest";
import { hasScreen } from "../shared/room-settings";
import {
  CHAT_MAX_LENGTH,
  CLIENT_EVENT,
  KEY_QUERY,
  ROOM_QUERY,
  SCREEN_VIEW,
  SERVER_EVENT,
  SOCKET_PATH,
  VIEW_QUERY,
  type Ack,
  type ChatMessagePayload,
  type RoomStatePayload,
} from "../shared/protocol";
import { authenticateSocket, type SocketUser } from "./auth";
import { RateLimiter } from "./rate-limit";
import { TwitchBridge } from "./twitch/bridge";
import { dropExpiredLinks } from "../lib/auth/links";
import { startCleanup } from "./cleanup";
import {
  pushChat,
  RoomManager,
  sweepStaleRooms,
  type ManagedRoom,
  type RoomSetup,
} from "./rooms";

export { SOCKET_PATH };

/** Не чаще этого игрок может слать действия и сообщения. */
const actionLimiter = new RateLimiter(20, 5_000);
const chatLimiter = new RateLimiter(5, 10_000);

export interface SocketServer {
  io: IOServer;
  /** Остановить таймеры комнат и игр при выключении сервера. */
  shutdown: () => void;
}

/**
 * Чьими глазами собирается снимок комнаты.
 *
 * Раньше хватало идентификатора игрока, но экран — это вторая вкладка того же
 * человека, и по идентификатору она получила бы секреты ведущего. Поэтому
 * решает сорт подключения, а не только чей он.
 */
export type Viewer = GameViewer;

/**
 * Комната только для игроков. Чат уходит сюда, а не всем подряд: экран его не
 * показывает (см. src/games/pricetitute/docs/BACKLOG.md O4), и незачем ему туда и попадать.
 */
function playersRoom(key: string): string {
  return `${key}:players`;
}

/** Значение параметра подключения. */
function readQuery(socket: Socket, name: string): string {
  const raw = socket.handshake.query[name];
  return typeof raw === "string" ? raw.trim() : "";
}

/** Просится ли подключение экраном. */
function wantsScreen(socket: Socket): boolean {
  return readQuery(socket, VIEW_QUERY) === SCREEN_VIEW;
}

export function createSocketServer(httpServer: HttpServer): SocketServer {
  const io = new IOServer(httpServer, {
    path: SOCKET_PATH,
    serveClient: false,
    // Engine.IO по умолчанию добивает upgrade-запросы, которые не попали в его
    // путь. В одном процессе с Next это убивает HMR-сокет, поэтому чужие
    // upgrade'ы оставляем в покое — их разбирает обработчик в server.ts.
    destroyUpgrade: false,
  });

  // Серверная часть каждой игры поднимается один раз на процесс. Что она там
  // держит — боты, мосты, кеши — платформу не касается.
  const servers = new Map<string, GameServer>();
  for (const game of GAME_SERVERS) {
    servers.set(
      game.id,
      game.createServer({
        sendChat: (roomKey, message) => {
          const managed = manager.get(roomKey);
          if (!managed) return;

          pushChat(managed, message);
          io.to(playersRoom(roomKey)).emit(SERVER_EVENT.chatMessage, message);
        },
      }),
    );
  }

  const serverFor = (gameId: string): GameServer => {
    const server = servers.get(gameId);
    if (!server) throw new Error(`Игра ${gameId} не поднята`);
    return server;
  };

  const manager = new RoomManager((managed) => {
    void broadcastState(io, managed, twitch);
  }, serverFor);

  // Мост в чат Твича. Ставка `!10000` доезжает до стола так же, как нажатие
  // кнопки: чтение чата анонимно и от стримера ничего не требует.
  const twitch = new TwitchBridge(manager, (roomKey) => {
    const managed = manager.get(roomKey);
    if (managed) void broadcastState(io, managed, twitch);
  });

  manager.onClose((roomKey) => twitch.detach(roomKey));

  io.use((socket, next) => {
    void authenticateSocket(socket.handshake.headers)
      .then((user) => {
        if (user) {
          socket.data.user = user;
          next();
          return;
        }

        // Экран пускаем и без сессии: у источника OBS её взять неоткуда.
        // Пропуск у него другой — ключ комнаты, и проверяется он в
        // onConnection, где уже известно, к какой комнате идёт подключение.
        if (wantsScreen(socket)) {
          next();
          return;
        }

        next(new Error("Нужно войти в аккаунт"));
      })
      .catch((error: unknown) => {
        console.error("[socket] аутентификация упала:", error);
        next(new Error("Сервер не смог проверить сессию"));
      });
  });

  io.on("connection", (socket) => {
    void onConnection(io, manager, twitch, socket);
  });

  // Уборка одним таймером, но каждое дело своё: комнаты не знают про почту.
  const stopCleanup = startCleanup([
    () => sweepStaleRooms(manager),
    async () => {
      const links = await dropExpiredLinks();
      if (links > 0) console.log(`[почта] убрано протухших ссылок: ${links}`);
    },
  ]);

  return {
    io,
    shutdown: () => {
      stopCleanup();
      twitch.stop();
      manager.closeAll();
      for (const server of servers.values()) server.stop();
      io.close();
    },
  };
}

interface RoomTarget {
  key: string;
  code: string | null;
  setup: RoomSetup;
  /** Пропуск для вида «экран»; у общего зала экрана нет вовсе. */
  screenKey: string | null;
}

/**
 * Куда сажать игрока: без кода — общий зал, с кодом — приватная комната.
 * Настройки партии берутся из базы, а не из того, что прислал клиент.
 *
 * Игра пока одна на всё. Комната узнает свою игру колонкой `gameId` на
 * следующем этапе (docs/BACKLOG.md A4), и тогда развилка станет настоящей.
 */
async function resolveRoom(socket: Socket): Promise<RoomTarget | null> {
  const game = defaultGameServer();
  const code = readQuery(socket, ROOM_QUERY);

  if (code === "") {
    return {
      key: game.commonRoomKey,
      code: null,
      screenKey: null,
      setup: {
        gameId: game.id,
        isPrivate: false,
        // У общего зала экрана нет, отсюда `private`.
        kind: "private",
        title: null,
        ownerId: null,
        // Общий зал не запирается и лимита не имеет: он один на всех.
        locked: false,
        maxPlayers: null,
        twitchChannel: null,
        settings: game.commonRoomSettings,
      },
    };
  }

  const room = await findPrivateRoom(code);
  if (!room) return null;

  const owner = gameServerById(game.id);
  if (!owner) return null;

  return {
    key: room.id,
    code: room.code,
    screenKey: hasScreen(room.kind) ? room.screenKey : null,
    setup: {
      gameId: owner.id,
      isPrivate: true,
      kind: room.kind,
      title: room.title,
      ownerId: room.hostId,
      locked: room.locked,
      maxPlayers: room.maxPlayers,
      twitchChannel: room.twitchChannel,
      settings: owner.roomSettings(room),
    },
  };
}

/**
 * Подключение экраном: смотрит партию, но за столом его нет и секретов ему не
 * присылают. Пропуск — ключ комнаты; хозяину со своей сессией ключ не нужен.
 */
async function onScreen(
  io: IOServer,
  manager: RoomManager,
  twitch: TwitchBridge,
  socket: Socket,
  target: RoomTarget,
): Promise<void> {
  const user = socket.data.user as SocketUser | undefined;

  if (target.screenKey === null) {
    socket.emit(SERVER_EVENT.kicked, { reason: "У этой комнаты нет экрана" });
    socket.disconnect(true);
    return;
  }

  const owner = user !== undefined && target.setup.ownerId === user.id;
  if (!owner && readQuery(socket, KEY_QUERY) !== target.screenKey) {
    socket.emit(SERVER_EVENT.kicked, { reason: "Экран этой комнаты закрыт" });
    socket.disconnect(true);
    return;
  }

  const viewer: Viewer = { kind: "screen" };
  const managed = await manager.watch(socket.id, target.key, target.setup);

  // Ждём, пока игра дожуёт свои побочные эффекты. Вход может запустить раунд,
  // а подробности подгружаются уже после события — без этой паузы первый
  // снимок ушёл бы неполным и его пришлось бы чинить следующей рассылкой.
  await managed.game.settled();

  await socket.join(target.key);
  socket.data.viewer = viewer;
  socket.data.roomCode = target.code;

  socket.emit(
    SERVER_EVENT.state,
    buildState(managed, viewer, target.code, twitch),
  );

  socket.on("disconnect", () => {
    manager.unwatch(socket.id, target.key);
  });
}

async function onConnection(
  io: IOServer,
  manager: RoomManager,
  twitch: TwitchBridge,
  socket: Socket,
): Promise<void> {
  const target = await resolveRoom(socket);
  if (!target) {
    socket.emit(SERVER_EVENT.kicked, { reason: "Комната не найдена" });
    socket.disconnect(true);
    return;
  }

  if (wantsScreen(socket)) {
    await onScreen(io, manager, twitch, socket, target);
    return;
  }

  const user = socket.data.user as SocketUser | undefined;
  if (!user) {
    socket.disconnect(true);
    return;
  }

  const roomKey = target.key;
  const roomCode = target.code;

  // Гость заведён ради одной комнаты. Сессия у него настоящая, поэтому дверь
  // приходится закрывать здесь, а не на подписи токена.
  if (user.guestRoomId !== null && user.guestRoomId !== roomKey) {
    socket.emit(SERVER_EVENT.kicked, {
      reason: "Гость играет только в своей комнате",
    });
    socket.disconnect(true);
    return;
  }

  // Замок и лимит проверяются до того, как человек сядет за стол: выгонять
  // уже севшего было бы и грубее, и сложнее.
  const refusal = await manager.admits(user, roomKey, target.setup);
  if (refusal !== null) {
    socket.emit(SERVER_EVENT.kicked, { reason: refusal });
    socket.disconnect(true);
    return;
  }

  const viewer: Viewer = { kind: "player", id: user.id };
  const managed = await manager.join(user, roomKey, target.setup);
  await managed.game.settled();

  // Канал слушаем, пока комната жива. Повторный вызов с тем же каналом ничего
  // не делает — а комнату поднимают на каждом входе.
  if (target.setup.twitchChannel) {
    twitch.attach(roomKey, target.setup.twitchChannel);
  }

  await socket.join(roomKey);
  await socket.join(playersRoom(roomKey));

  socket.data.viewer = viewer;
  socket.data.roomCode = roomCode;
  socket.emit(SERVER_EVENT.chatHistory, managed.chat);
  socket.emit(
    SERVER_EVENT.state,
    buildState(managed, viewer, roomCode, twitch),
  );
  void broadcastState(io, managed, twitch);

  // Действия игры платформа только передаёт: какие они бывают, объявляет
  // манифест, а что они значат — знает движок (docs/BACKLOG.md A3).
  const game = gameServerById(target.setup.gameId);
  for (const action of game?.actions ?? []) {
    socket.on(action, (...args: unknown[]) => {
      void respondAsync(args, async (payload) => {
        if (!actionLimiter.allow(user.id)) return tooFast();
        return managed.game.act(action, user.id, payload);
      });
    });
  }

  socket.on(CLIENT_EVENT.chat, (...args: unknown[]) => {
    respond(args, (payload) => {
      const text = readText(payload);
      if (!text) return { accepted: false, reason: "Пустое сообщение" };
      if (text.length > CHAT_MAX_LENGTH) {
        return { accepted: false, reason: "Сообщение слишком длинное" };
      }
      if (!chatLimiter.allow(user.id)) {
        return { accepted: false, reason: "Слишком часто, притормози" };
      }

      const message: ChatMessagePayload = {
        id: randomUUID(),
        playerId: user.id,
        nickname: user.nickname,
        avatarId: user.avatarId,
        text,
        at: Date.now(),
      };

      pushChat(managed, message);
      io.to(playersRoom(roomKey)).emit(SERVER_EVENT.chatMessage, message);

      return { accepted: true };
    });
  });

  socket.on(CLIENT_EVENT.kick, (...args: unknown[]) => {
    respond(args, (payload) => {
      const targetId = readString(payload, "playerId");
      if (!targetId) return { accepted: false, reason: "Кого выгонять?" };

      const result = managed.game.remove(user.id, targetId);

      // Выгнать из круга мало: без разрыва сокета человек остался бы в
      // комнате призраком — видел бы игру, но не мог в ней участвовать.
      if (result.accepted) {
        void disconnectPlayer(io, roomKey, targetId, "Тебя выгнали из комнаты");
      }

      return result;
    });
  });

  socket.on(CLIENT_EVENT.lock, (...args: unknown[]) => {
    void respondAsync(args, async (payload) => {
      if (target.setup.ownerId !== user.id) {
        return { accepted: false, reason: "Набор закрывает только хозяин" };
      }

      const locked = readBoolean(payload, "locked");
      managed.locked = locked;

      // Замок переживает перезапуск: комната остаётся закрытой, а не
      // распахивается сама, пока хозяин смотрит в другую сторону.
      if (target.setup.isPrivate) await setRoomLocked(roomKey, locked);

      void broadcastState(io, managed, twitch);
      return { accepted: true };
    });
  });

  socket.on(CLIENT_EVENT.rename, (...args: unknown[]) => {
    void respondAsync(args, async (payload) => {
      if (target.setup.ownerId !== user.id) {
        return {
          accepted: false,
          reason: "Переименовывать может только хозяин",
        };
      }

      const targetId = readString(payload, "playerId");
      const nickname = readString(payload, "nickname")?.trim() ?? "";
      if (!targetId)
        return { accepted: false, reason: "Кого переименовывать?" };

      const profile = managed.profiles.get(targetId);
      // Только гостей: чужой аккаунт хозяину комнаты не принадлежит.
      if (!profile || !profile.isGuest) {
        return { accepted: false, reason: "Так можно только с гостями" };
      }

      const problem = checkNickname(nickname);
      if (problem) return { accepted: false, reason: problem };

      await renameGuest(targetId, nickname);
      managed.profiles.set(targetId, { ...profile, nickname });

      void broadcastState(io, managed, twitch);
      return { accepted: true };
    });
  });

  socket.on("disconnect", () => {
    manager.leave(user, roomKey);
    void broadcastState(io, managed, twitch);
  });
}

/**
 * Состояние комнаты глазами конкретного подключения: платформенное ядро плюс
 * то, что положила игра. Внутрь игровой части платформа не смотрит.
 */
export function buildState(
  managed: ManagedRoom,
  viewer: Viewer,
  roomCode: string | null = null,
  twitch?: TwitchBridge,
): RoomStatePayload {
  const isScreen = viewer.kind === "screen";
  const snapshot = managed.game.snapshot(viewer);

  return {
    roomKey: managed.key,
    deadline: snapshot.deadline,
    phaseDurationMs: snapshot.phaseDurationMs,
    serverTime: Date.now(),
    players: snapshot.players.map((player) => {
      const profile = managed.profiles.get(player.id);
      return {
        id: player.id,
        nickname: profile?.nickname ?? "Игрок",
        avatarId: profile?.avatarId ?? 0,
        isGuest: profile?.isGuest ?? false,
        ...player.extra,
      };
    }),
    playerCount: snapshot.playerCount,
    ownerId: managed.setup.ownerId,
    roomCode,
    roomKind: managed.setup.kind,
    roomTitle: managed.setup.title,
    isScreen,
    locked: managed.locked,
    maxPlayers: managed.maxPlayers,
    twitchChannel: managed.setup.twitchChannel,
    twitchConnected: twitch?.connected(managed.key) ?? false,
    youId: isScreen ? "" : viewer.id,
    ...snapshot.extra,
  };
}

/** Разорвать все соединения игрока с комнатой, объяснив причину. */
async function disconnectPlayer(
  io: IOServer,
  roomKey: string,
  playerId: string,
  reason: string,
): Promise<void> {
  const sockets = await io.in(roomKey).fetchSockets();

  for (const socket of sockets) {
    const user = socket.data.user as SocketUser | undefined;
    if (user?.id !== playerId) continue;

    socket.emit(SERVER_EVENT.kicked, { reason });
    socket.disconnect(true);
  }
}

/** Каждому своё состояние: секреты видит только тот, кому они полагаются. */
async function broadcastState(
  io: IOServer,
  managed: ManagedRoom,
  twitch?: TwitchBridge,
) {
  const sockets = await io.in(managed.key).fetchSockets();

  for (const socket of sockets) {
    const viewer = socket.data.viewer as Viewer | undefined;
    if (!viewer) continue;

    const code = socket.data.roomCode as string | null | undefined;
    socket.emit(
      SERVER_EVENT.state,
      buildState(managed, viewer, code ?? null, twitch),
    );
  }
}

interface HandlerResult {
  accepted: boolean;
  reason?: string;
}

/**
 * Обёртка над обработчиком: разбирает аргументы, зовёт дело и отвечает клиенту
 * подтверждением, если он его ждёт.
 */
function respond(
  args: unknown[],
  handle: (payload: unknown) => HandlerResult,
): void {
  const ack = args.find((arg): arg is (reply: Ack) => void => {
    return typeof arg === "function";
  });

  try {
    const result = handle(args[0]);
    ack?.(result.accepted ? { ok: true } : { ok: false, error: result.reason });
  } catch (error: unknown) {
    console.error("[socket] обработчик упал:", error);
    ack?.({ ok: false, error: "Что-то пошло не так" });
  }
}

/** То же, но для обработчиков, которым надо сходить в базу. */
async function respondAsync(
  args: unknown[],
  handle: (payload: unknown) => Promise<HandlerResult> | HandlerResult,
): Promise<void> {
  const ack = args.find((arg): arg is (reply: Ack) => void => {
    return typeof arg === "function";
  });

  try {
    const result = await handle(args[0]);
    ack?.(result.accepted ? { ok: true } : { ok: false, error: result.reason });
  } catch (error: unknown) {
    console.error("[socket] обработчик упал:", error);
    ack?.({ ok: false, error: "Что-то пошло не так" });
  }
}

function tooFast(): HandlerResult {
  return { accepted: false, reason: "Слишком часто, притормози" };
}

/** Число из полезной нагрузки; отсутствие — это null, а не ноль. */
function readBoolean(payload: unknown, field: string): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  return (payload as Record<string, unknown>)[field] === true;
}

function readString(payload: unknown, field: string): string | null {
  if (typeof payload !== "object" || payload === null) return null;

  const value = (payload as Record<string, unknown>)[field];
  return typeof value === "string" && value !== "" ? value : null;
}

function readText(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;

  const value = (payload as Record<string, unknown>).text;
  if (typeof value !== "string") return null;

  const text = value.trim();
  return text === "" ? null : text;
}

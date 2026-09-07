import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { Server as IOServer, type Socket } from "socket.io";
import { champions, refreshChampions } from "../lib/champions";
import { parseBet } from "../lib/game/bet";
import { renameGuest } from "../lib/auth/guest";
import { findPrivateRoom, setRoomLocked } from "../lib/rooms/private";
import { checkNickname } from "../shared/guest";
import { questionCard } from "../lib/questions/store";
import { hasScreen } from "../shared/room-settings";
import {
  CHAT_MAX_LENGTH,
  CLIENT_EVENT,
  GLOBAL_ROOM,
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
import { BOT_LIMIT, BOT_PARTY_SIZE, BotDirector } from "./bots/director";
import { RateLimiter } from "./rate-limit";
import { TwitchBridge } from "./twitch/bridge";
import {
  GLOBAL_SETUP,
  pushChat,
  RoomManager,
  startRoomCleanup,
  type ManagedRoom,
  type RoomSetup,
} from "./rooms";

export { SOCKET_PATH };

/**
 * Сколько игроков влезает в снимок. Пока за столом не больше — шлём всех и
 * ничего не меняется; дальше состав режется, потому что рассылка иначе растёт
 * квадратом от числа людей (см. docs/BACKLOG.md N4).
 */
const PLAYERS_IN_SNAPSHOT = 12;

/** Сколько строк ставок влезает во вскрышку. */
const BETS_IN_REVEAL = 10;

/** Действия игрока: защита от заклинившей кнопки и от скрипта-спамера. */
const actionLimiter = new RateLimiter(20, 5_000);
const chatLimiter = new RateLimiter(5, 10_000);

export interface SocketServer {
  io: IOServer;
  /** Остановить таймеры комнат и ботов при выключении сервера. */
  shutdown: () => void;
}

/**
 * Чьими глазами собирается снимок комнаты.
 *
 * Раньше хватало идентификатора игрока, но экран — это вторая вкладка того же
 * человека, и по идентификатору она получила бы вопрос ведущего в фазе READY.
 * Поэтому решает сорт подключения, а не только чей он.
 */
export type Viewer = { kind: "player"; id: string } | { kind: "screen" };

/**
 * Комната только для игроков. Чат уходит сюда, а не всем подряд: экран его не
 * показывает (см. docs/BACKLOG.md O4), и незачем ему туда и попадать.
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

  // Рассылка менеджера ссылается на директора, который создаётся ниже: к
  // моменту первого вызова он уже есть. Без этого снимок, разосланный по ходу
  // игры, уходил бы без числа ботов, и панель хозяина врала бы.
  const manager = new RoomManager((managed) => {
    void broadcastState(io, managed, director, twitch);
  });

  const director = new BotDirector(manager, {
    sendChat: (roomKey, message) => {
      const managed = manager.get(roomKey);
      if (!managed) return;

      pushChat(managed, message);
      io.to(playersRoom(roomKey)).emit(SERVER_EVENT.chatMessage, message);
    },
  });
  director.start();

  // Мост в чат Твича. Ставка `!10000` доезжает до стола так же, как нажатие
  // кнопки: чтение чата анонимно и от стримера ничего не требует.
  const twitch = new TwitchBridge(manager, (roomKey) => {
    const managed = manager.get(roomKey);
    if (managed) void broadcastState(io, managed, director, twitch);
  });

  manager.onClose = (roomKey) => twitch.detach(roomKey);

  // Греем кеш чемпионов заранее: иначе первый вошедший увидит комнату без
  // корон и дождётся их только со следующей рассылкой.
  refreshChampions();

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
    void onConnection(io, manager, director, twitch, socket);
  });

  const stopCleanup = startRoomCleanup(manager);

  return {
    io,
    shutdown: () => {
      stopCleanup();
      twitch.stop();
      director.stop();
      manager.closeAll();
      io.close();
    },
  };
}

/**
 * Куда сажать игрока: без кода — общая комната, с кодом — приватная.
 * Правила партии берутся из базы, а не из того, что прислал клиент.
 */
interface RoomTarget {
  key: string;
  code: string | null;
  setup: RoomSetup;
  /** Пропуск для вида «экран»; у общего зала экрана нет вовсе. */
  screenKey: string | null;
}

async function resolveRoom(socket: Socket): Promise<RoomTarget | null> {
  const code = readQuery(socket, ROOM_QUERY);

  if (code === "") {
    return {
      key: GLOBAL_ROOM,
      code: null,
      setup: GLOBAL_SETUP,
      screenKey: null,
    };
  }

  const room = await findPrivateRoom(code);
  if (!room) return null;

  return {
    key: room.id,
    code: room.code,
    screenKey: hasScreen(room.kind) ? room.screenKey : null,
    setup: {
      pool: { includeAdult: room.includeAdult, mode: room.mode },
      rules: {
        timings: { bettingMs: room.bettingMs, revealMs: room.revealMs },
        endMode: room.endMode,
        endValue: room.endValue,
        ownerId: room.hostId,
        hostRotation: room.hostRotation,
      },
      isPrivate: true,
      kind: room.kind,
      title: room.title,
      locked: room.locked,
      maxPlayers: room.maxPlayers,
      twitchChannel: room.twitchChannel,
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
  director: BotDirector,
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

  const owner = user !== undefined && target.setup.rules.ownerId === user.id;
  if (!owner && readQuery(socket, KEY_QUERY) !== target.screenKey) {
    socket.emit(SERVER_EVENT.kicked, { reason: "Экран этой комнаты закрыт" });
    socket.disconnect(true);
    return;
  }

  const viewer: Viewer = { kind: "screen" };
  const managed = await manager.watch(socket.id, target.key, target.setup);

  // Ждём, пока комната дожуёт свои побочные эффекты. Вход может запустить
  // раунд, а текст вопроса подгружается уже после события — без этой паузы
  // первый снимок ушёл бы с пустым вопросом и его пришлось бы чинить
  // следующей рассылкой.
  await managed.tail;

  await socket.join(target.key);
  socket.data.viewer = viewer;
  socket.data.roomCode = target.code;

  socket.emit(
    SERVER_EVENT.state,
    buildState(
      managed,
      viewer,
      target.code,
      director.count(target.key),
      twitch,
    ),
  );

  socket.on("disconnect", () => {
    manager.unwatch(socket.id, target.key);
  });
}

async function onConnection(
  io: IOServer,
  manager: RoomManager,
  director: BotDirector,
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
    await onScreen(io, manager, director, twitch, socket, target);
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
  await managed.tail;

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
    buildState(managed, viewer, roomCode, director.count(roomKey), twitch),
  );
  void broadcastState(io, managed, director, twitch);

  socket.on(CLIENT_EVENT.read, (...args: unknown[]) => {
    respond(args, () => {
      if (!actionLimiter.allow(user.id)) return tooFast();
      return managed.runner.run((room, now) => room.confirmRead(user.id, now));
    });
  });

  socket.on(CLIENT_EVENT.answer, (...args: unknown[]) => {
    respond(args, (payload) => {
      if (!actionLimiter.allow(user.id)) return tooFast();

      const bet = parseBet(readBet(payload));
      if (bet === null)
        return { accepted: false, reason: "Некорректная сумма" };

      return managed.runner.run((room, now) =>
        room.submitHostAnswer(user.id, bet, now),
      );
    });
  });

  socket.on(CLIENT_EVENT.bet, (...args: unknown[]) => {
    respond(args, (payload) => {
      if (!actionLimiter.allow(user.id)) return tooFast();

      const bet = parseBet(readBet(payload));
      if (bet === null)
        return { accepted: false, reason: "Некорректная сумма" };

      return managed.runner.run((room, now) =>
        room.placeBet(user.id, bet, now),
      );
    });
  });

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

      const result = managed.runner.run((room, now) =>
        room.kick(user.id, targetId, now),
      );

      // Выгнать из круга мало: без разрыва сокета человек остался бы в
      // комнате призраком — видел бы игру, но не мог в ней участвовать.
      if (result.accepted) {
        void disconnectPlayer(io, roomKey, targetId, "Тебя выгнали из комнаты");
      }

      return result;
    });
  });

  socket.on(CLIENT_EVENT.closeBetting, (...args: unknown[]) => {
    respond(args, () =>
      managed.runner.run((room, now) => room.closeBetting(user.id, now)),
    );
  });

  socket.on(CLIENT_EVENT.lock, (...args: unknown[]) => {
    void respondAsync(args, async (payload) => {
      if (managed.room.view().ownerId !== user.id) {
        return { accepted: false, reason: "Набор закрывает только хозяин" };
      }

      const locked = readBoolean(payload, "locked");
      managed.locked = locked;

      // Замок переживает перезапуск: комната остаётся закрытой, а не
      // распахивается сама, пока хозяин смотрит в другую сторону.
      if (target.setup.isPrivate) await setRoomLocked(roomKey, locked);

      void broadcastState(io, managed, director, twitch);
      return { accepted: true };
    });
  });

  socket.on(CLIENT_EVENT.rename, (...args: unknown[]) => {
    void respondAsync(args, async (payload) => {
      if (managed.room.view().ownerId !== user.id) {
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
      if (!profile || profile.guestRoomId !== roomKey) {
        return { accepted: false, reason: "Так можно только с гостями" };
      }

      const problem = checkNickname(nickname);
      if (problem) return { accepted: false, reason: problem };

      await renameGuest(targetId, nickname);
      managed.profiles.set(targetId, { ...profile, nickname });

      void broadcastState(io, managed, director, twitch);
      return { accepted: true };
    });
  });

  socket.on(CLIENT_EVENT.restart, (...args: unknown[]) => {
    respond(args, () =>
      managed.runner.run((room, now) => room.restart(user.id, now)),
    );
  });

  socket.on(CLIENT_EVENT.fillBots, (...args: unknown[]) => {
    void respondAsync(args, async () => {
      if (!target.setup.isPrivate) {
        return {
          accepted: false,
          reason: "Боты приходят только в свою комнату",
        };
      }
      if (managed.room.view().ownerId !== user.id) {
        return { accepted: false, reason: "Звать ботов может только хозяин" };
      }

      // Вид компании решает не число людей за столом, а то, как её позвали.
      // Кнопка «Forever alone» шлёт запрос без числа — такие боты уходят сами,
      // когда появляется живой человек. Добор из панели шлёт число: этих
      // хозяин позвал осознанно, и уводить их за него не нужно.
      const asked = readNumber(args[0]);
      const kind = asked === null ? "alone" : "invited";
      const count = asked ?? BOT_PARTY_SIZE;

      if (director.count(roomKey) >= BOT_LIMIT) {
        return { accepted: false, reason: "Больше ботов не поместится" };
      }

      const added = await director.fill(roomKey, count, kind);
      if (added === 0) {
        return { accepted: false, reason: "Не удалось позвать ботов" };
      }

      void broadcastState(io, managed, director, twitch);
      return { accepted: true };
    });
  });

  socket.on(CLIENT_EVENT.dismissBots, (...args: unknown[]) => {
    respond(args, () => {
      if (managed.room.view().ownerId !== user.id) {
        return { accepted: false, reason: "Выгонять может только хозяин" };
      }
      if (!director.hasParty(roomKey)) {
        return { accepted: false, reason: "Ботов и так нет" };
      }

      // Прощаются как обычно: молча исчезнувшая компания выглядит сбоем.
      director.farewell(roomKey);
      void broadcastState(io, managed, director, twitch);

      return { accepted: true };
    });
  });

  socket.on("disconnect", () => {
    manager.leave(user, roomKey);
    void broadcastState(io, managed, director, twitch);
  });
}

/** Состояние комнаты глазами конкретного подключения. */
export function buildState(
  managed: ManagedRoom,
  viewer: Viewer,
  roomCode: string | null = null,
  botCount = 0,
  twitch?: TwitchBridge,
): RoomStatePayload {
  const view = managed.room.view();
  const isScreen = viewer.kind === "screen";
  const viewerId = isScreen ? "" : viewer.id;

  // В фазе READY вопрос знает только ведущий — и только на своём экране.
  // Экран не знает его никогда: он для того и заведён.
  const questionVisible =
    view.questionVisibleToAll || (!isScreen && view.hostId === viewerId);
  const winners = new Set(view.reveal?.winners ?? []);

  // Вопрос берётся по идентификатору из самого снимка, а не из отложенной
  // загрузки: движок меняет фазу мгновенно, а текст подгружается следующим
  // шагом, и рассылка, попавшая в это окно, уходила бы с пустым вопросом.
  const card =
    questionCard(view.questionId) ??
    (managed.question?.id === view.questionId ? managed.question : null);

  // Чемпионы берутся из кеша, а обновление уходит в фон: держать рассылку
  // состояния ради похода в базу нельзя.
  refreshChampions();
  const champs = champions();

  return {
    roomKey: managed.key,
    phase: view.phase,
    deadline: view.deadline,
    phaseDurationMs: view.phaseDurationMs,
    serverTime: Date.now(),
    hostId: view.hostId,
    question: questionVisible ? (card?.text ?? null) : null,
    questionAdult: questionVisible && (card?.adult ?? false),
    players: trimPlayers(view.players, viewerId, view.hostId).map((player) => {
      const profile = managed.profiles.get(player.id);
      return {
        id: player.id,
        nickname: profile?.nickname ?? "Игрок",
        avatarId: profile?.avatarId ?? 0,
        score: player.score,
        roundsPlayed: player.roundsPlayed,
        hasBet: player.hasBet,
        isHost: player.isHost,
        isGuest: profile?.guestRoomId != null,
      };
    }),
    reveal: view.reveal
      ? {
          hostAnswer: view.reveal.hostAnswer,
          betCount: view.reveal.bets.length,
          bets: trimBets(view.reveal, viewerId).map((bet) => ({
            playerId: bet.playerId,
            bet: bet.bet,
            distance: view.reveal?.distances[bet.playerId] ?? null,
            won: winners.has(bet.playerId),
          })),
        }
      : null,
    pauseReason: view.pauseReason,
    winners: view.winners,
    roundsPlayed: view.roundsPlayed,
    endMode: view.endMode,
    endValue: view.endValue,
    ownerId: view.ownerId,
    allTimeChampionId: champs.allTime,
    weekChampionId: champs.week,
    roomCode,
    roomKind: managed.setup.kind,
    roomTitle: managed.setup.title,
    isScreen,
    locked: managed.locked,
    maxPlayers: managed.maxPlayers,
    twitchChannel: managed.setup.twitchChannel,
    twitchConnected: twitch?.connected(managed.key) ?? false,
    // Кнопка «Forever alone» — только хозяину пустой приватной комнаты.
    canInviteBots:
      !isScreen &&
      managed.setup.isPrivate &&
      view.ownerId === viewerId &&
      managed.connections.size === 1 &&
      botCount === 0,
    canManageBots:
      !isScreen && managed.setup.isPrivate && view.ownerId === viewerId,
    botCount,
    botLimit: BOT_LIMIT,
    playerCount: view.players.length,
    youId: viewerId,
  };
}

/**
 * Кого положить в снимок. Ведущий и сам зритель — всегда: без них экран врёт
 * про то, чей ход и поставил ли ты. Остальные места достаются верхушке
 * таблицы, а порядок сохраняется прежний — по кругу ходов.
 */
function trimPlayers<T extends { id: string; score: number }>(
  players: readonly T[],
  viewerId: string,
  hostId: string | null,
): readonly T[] {
  if (players.length <= PLAYERS_IN_SNAPSHOT) return players;

  const keep = new Set<string>();
  if (hostId !== null) keep.add(hostId);
  if (viewerId !== "") keep.add(viewerId);

  for (const player of [...players].sort((a, b) => b.score - a.score)) {
    if (keep.size >= PLAYERS_IN_SNAPSHOT) break;
    keep.add(player.id);
  }

  return players.filter((player) => keep.has(player.id));
}

/**
 * Какие ставки показать на вскрышке: ближайшие к ответу и своя. Промахнувшихся
 * в сто раз не читают, а на большой комнате их сотни.
 */
function trimBets<T extends { playerId: string }>(
  reveal: { bets: readonly T[]; distances: Record<string, number | null> },
  viewerId: string,
): readonly T[] {
  if (reveal.bets.length <= BETS_IN_REVEAL) return reveal.bets;

  const closest = [...reveal.bets].sort((a, b) => {
    const left = reveal.distances[a.playerId];
    const right = reveal.distances[b.playerId];
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;
    return left - right;
  });

  const keep = new Set(
    closest.slice(0, BETS_IN_REVEAL).map((bet) => bet.playerId),
  );
  if (viewerId !== "") keep.add(viewerId);

  return reveal.bets.filter((bet) => keep.has(bet.playerId));
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

/** Каждому своё состояние: вопрос в фазе READY виден только ведущему. */
async function broadcastState(
  io: IOServer,
  managed: ManagedRoom,
  director: BotDirector,
  twitch?: TwitchBridge,
) {
  const sockets = await io.in(managed.key).fetchSockets();
  const botCount = director.count(managed.key);

  for (const socket of sockets) {
    const viewer = socket.data.viewer as Viewer | undefined;
    if (!viewer) continue;

    const code = socket.data.roomCode as string | null | undefined;
    socket.emit(
      SERVER_EVENT.state,
      buildState(managed, viewer, code ?? null, botCount, twitch),
    );
  }
}

interface HandlerResult {
  accepted: boolean;
  reason?: string;
}

/** Разбирает необязательный колбэк подтверждения и отвечает автору действия. */
function respond(
  args: unknown[],
  handler: (payload: unknown) => HandlerResult,
): void {
  const ack = args.find(
    (arg): arg is (result: Ack) => void => typeof arg === "function",
  );
  const payload = args.find((arg) => typeof arg !== "function");

  let result: HandlerResult;
  try {
    result = handler(payload);
  } catch (error) {
    console.error("[socket] действие упало:", error);
    result = { accepted: false, reason: "Что-то сломалось на сервере" };
  }

  ack?.(
    result.accepted ? { ok: true } : { ok: false, error: result.reason ?? "" },
  );
}

/** То же, что respond, но для действий, которым нужен поход в базу. */
async function respondAsync(
  args: unknown[],
  handler: (payload: unknown) => Promise<HandlerResult>,
): Promise<void> {
  const ack = args.find(
    (arg): arg is (result: Ack) => void => typeof arg === "function",
  );
  const payload = args.find((arg) => typeof arg !== "function");

  let result: HandlerResult;
  try {
    result = await handler(payload);
  } catch (error) {
    console.error("[socket] действие упало:", error);
    result = { accepted: false, reason: "Что-то сломалось на сервере" };
  }

  ack?.(
    result.accepted ? { ok: true } : { ok: false, error: result.reason ?? "" },
  );
}

function tooFast(): HandlerResult {
  return { accepted: false, reason: "Слишком много действий, притормози" };
}

function readBet(payload: unknown): unknown {
  if (typeof payload === "object" && payload !== null && "bet" in payload) {
    return (payload as { bet: unknown }).bet;
  }
  return payload;
}

/**
 * Сколько ботов просят позвать. `null` — число не прислали вовсе; это отличает
 * кнопку «Forever alone» от добора из панели, а не только меняет количество.
 */
function readNumber(payload: unknown): number | null {
  if (typeof payload !== "object" || payload === null) return null;

  const value = (payload as { count?: unknown }).count;
  const count = Math.trunc(Number(value));

  return Number.isFinite(count) && count > 0 ? count : null;
}

/** Достать логическое поле из полезной нагрузки события. */
function readBoolean(payload: unknown, field: string): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  return (payload as Record<string, unknown>)[field] === true;
}

/** Достать строковое поле из полезной нагрузки события. */
function readString(payload: unknown, field: string): string | null {
  if (typeof payload !== "object" || payload === null) return null;

  const value = (payload as Record<string, unknown>)[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readText(payload: unknown): string | null {
  const raw =
    typeof payload === "object" && payload !== null && "text" in payload
      ? (payload as { text: unknown }).text
      : payload;

  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

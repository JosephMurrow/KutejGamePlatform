import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { Server as IOServer, type Socket } from "socket.io";
import { champions, refreshChampions } from "../lib/champions";
import { parseBet } from "../lib/game/bet";
import { findPrivateRoom } from "../lib/rooms/private";
import {
  CHAT_MAX_LENGTH,
  CLIENT_EVENT,
  GLOBAL_ROOM,
  ROOM_QUERY,
  SERVER_EVENT,
  SOCKET_PATH,
  type Ack,
  type ChatMessagePayload,
  type RoomStatePayload,
} from "../shared/protocol";
import { authenticateSocket, type SocketUser } from "./auth";
import { BotDirector } from "./bots/director";
import { RateLimiter } from "./rate-limit";
import {
  GLOBAL_SETUP,
  pushChat,
  RoomManager,
  startRoomCleanup,
  type ManagedRoom,
  type RoomSetup,
} from "./rooms";

export { SOCKET_PATH };

/** Действия игрока: защита от заклинившей кнопки и от скрипта-спамера. */
const actionLimiter = new RateLimiter(20, 5_000);
const chatLimiter = new RateLimiter(5, 10_000);

export interface SocketServer {
  io: IOServer;
  /** Остановить таймеры комнат и ботов при выключении сервера. */
  shutdown: () => void;
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

  const manager = new RoomManager((managed) => {
    void broadcastState(io, managed);
  });

  const director = new BotDirector(manager, {
    sendChat: (roomKey, message) => {
      const managed = manager.get(roomKey);
      if (!managed) return;

      pushChat(managed, message);
      io.to(roomKey).emit(SERVER_EVENT.chatMessage, message);
    },
  });
  director.start();

  // Греем кеш чемпионов заранее: иначе первый вошедший увидит комнату без
  // корон и дождётся их только со следующей рассылкой.
  refreshChampions();

  io.use((socket, next) => {
    void authenticateSocket(socket.handshake.headers)
      .then((user) => {
        if (!user) {
          next(new Error("Нужно войти в аккаунт"));
          return;
        }
        socket.data.user = user;
        next();
      })
      .catch((error: unknown) => {
        console.error("[socket] аутентификация упала:", error);
        next(new Error("Сервер не смог проверить сессию"));
      });
  });

  io.on("connection", (socket) => {
    void onConnection(io, manager, director, socket);
  });

  const stopCleanup = startRoomCleanup(manager);

  return {
    io,
    shutdown: () => {
      stopCleanup();
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
async function resolveRoom(
  socket: Socket,
): Promise<{ key: string; code: string | null; setup: RoomSetup } | null> {
  const raw = socket.handshake.query[ROOM_QUERY];
  const code = typeof raw === "string" ? raw.trim() : "";

  if (code === "") {
    return { key: GLOBAL_ROOM, code: null, setup: GLOBAL_SETUP };
  }

  const room = await findPrivateRoom(code);
  if (!room) return null;

  return {
    key: room.id,
    code: room.code,
    setup: {
      pool: { includeAdult: room.includeAdult, mode: room.mode },
      rules: {
        timings: { bettingMs: room.bettingMs, revealMs: room.revealMs },
        endMode: room.endMode,
        endValue: room.endValue,
        ownerId: room.hostId,
      },
      isPrivate: true,
    },
  };
}

async function onConnection(
  io: IOServer,
  manager: RoomManager,
  director: BotDirector,
  socket: Socket,
): Promise<void> {
  const user = socket.data.user as SocketUser | undefined;
  if (!user) {
    socket.disconnect(true);
    return;
  }

  const target = await resolveRoom(socket);
  if (!target) {
    socket.emit(SERVER_EVENT.kicked, { reason: "Комната не найдена" });
    socket.disconnect(true);
    return;
  }

  const roomKey = target.key;
  const roomCode = target.code;
  const managed = await manager.join(user, roomKey, target.setup);
  await socket.join(roomKey);

  socket.data.roomCode = roomCode;
  socket.emit(SERVER_EVENT.chatHistory, managed.chat);
  socket.emit(
    SERVER_EVENT.state,
    buildState(managed, user.id, roomCode, director.hasParty(roomKey)),
  );
  void broadcastState(io, managed, director);

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
      io.to(roomKey).emit(SERVER_EVENT.chatMessage, message);

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
      if (managed.connections.size > 1) {
        return { accepted: false, reason: "В комнате уже есть живые игроки" };
      }
      if (director.hasParty(roomKey)) {
        return { accepted: false, reason: "Боты уже здесь" };
      }

      const added = await director.fill(roomKey);
      if (added === 0) {
        return { accepted: false, reason: "Не удалось позвать ботов" };
      }

      void broadcastState(io, managed, director);
      return { accepted: true };
    });
  });

  socket.on("disconnect", () => {
    manager.leave(user, roomKey);
    void broadcastState(io, managed, director);
  });
}

/** Состояние комнаты глазами конкретного игрока. */
export function buildState(
  managed: ManagedRoom,
  viewerId: string,
  roomCode: string | null = null,
  botsPresent = false,
): RoomStatePayload {
  const view = managed.room.view();
  // В фазе READY вопрос знает только ведущий.
  const questionVisible = view.questionVisibleToAll || view.hostId === viewerId;
  const winners = new Set(view.reveal?.winners ?? []);

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
    question: questionVisible ? (managed.question?.text ?? null) : null,
    questionAdult: questionVisible && (managed.question?.adult ?? false),
    players: view.players.map((player) => {
      const profile = managed.profiles.get(player.id);
      return {
        id: player.id,
        nickname: profile?.nickname ?? "Игрок",
        avatarId: profile?.avatarId ?? 0,
        score: player.score,
        roundsPlayed: player.roundsPlayed,
        hasBet: player.hasBet,
        isHost: player.isHost,
      };
    }),
    reveal: view.reveal
      ? {
          hostAnswer: view.reveal.hostAnswer,
          bets: view.reveal.bets.map((bet) => ({
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
    // Кнопка «Forever alone» — только хозяину пустой приватной комнаты.
    canInviteBots:
      managed.setup.isPrivate &&
      view.ownerId === viewerId &&
      managed.connections.size === 1 &&
      !botsPresent,
    youId: viewerId,
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

/** Каждому своё состояние: вопрос в фазе READY виден только ведущему. */
async function broadcastState(
  io: IOServer,
  managed: ManagedRoom,
  director?: BotDirector,
) {
  const sockets = await io.in(managed.key).fetchSockets();
  const botsPresent = director?.hasParty(managed.key) ?? false;

  for (const socket of sockets) {
    const user = socket.data.user as SocketUser | undefined;
    if (!user) continue;

    const code = socket.data.roomCode as string | null | undefined;
    socket.emit(
      SERVER_EVENT.state,
      buildState(managed, user.id, code ?? null, botsPresent),
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

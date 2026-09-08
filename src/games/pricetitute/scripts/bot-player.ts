import { io } from "socket.io-client";
import { signSessionToken } from "@/lib/auth/token";
import { randomAvatarId } from "@/lib/avatars";
import { prisma } from "@/lib/prisma";
import {
  ROOM_QUERY,
  SERVER_EVENT,
  SOCKET_PATH,
  type Ack,
} from "@/shared/protocol";
import { type GameStatePayload } from "../protocol";
import { GAME_EVENT } from "../protocol";

/**
 * Бот-напарник для ручной проверки интерфейса: садится в общую комнату и
 * играет сам — читает вопрос, называет сумму, ставит. Нужен, чтобы одному
 * человеку было с кем крутить раунды.
 *
 *   npm run bot -- Маша
 *   npm run bot -- Маша K7M2QX     # в приватную комнату по коду
 */
const URL = process.env.BOT_URL ?? "http://localhost:3000";
const nickname = process.argv[2] ?? "Бот Маша";
const roomCode = process.argv[3];
const login = `bot_${nickname.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "_")}`;

const SUMS = [500, 5_000, 25_000, 150_000, 900_000, 5_000_000];
const pick = () => SUMS[Math.floor(Math.random() * SUMS.length)] ?? 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const user = await prisma.user.upsert({
    where: { login },
    create: {
      login,
      passwordHash: "bot",
      nickname,
      avatarId: randomAvatarId(),
      adultConfirmedAt: new Date(),
    },
    update: { nickname },
    select: { id: true },
  });

  const token = await signSessionToken(user.id, 24 * 3600);
  const socket = io(URL, {
    path: SOCKET_PATH,
    transports: ["websocket"],
    extraHeaders: { Cookie: `pt_session=${token}` },
    query: roomCode ? { [ROOM_QUERY]: roomCode } : undefined,
  });

  socket.on("connect", () =>
    console.log(`${nickname} за столом${roomCode ? ` (${roomCode})` : ""}`),
  );
  socket.on("connect_error", (error: Error) =>
    console.error("не подключиться:", error.message),
  );

  let acting = false;

  socket.on(SERVER_EVENT.state, (state: GameStatePayload) => {
    if (acting) return;

    const isHost = state.hostId === user.id;
    const you = state.players.find((player) => player.id === user.id);

    const act = async (event: string, payload: unknown, delay: number) => {
      acting = true;
      await sleep(delay);
      await new Promise<Ack>((resolve) => {
        socket.emit(event, payload, resolve);
      });
      acting = false;
    };

    if (isHost && state.phase === "ready") {
      console.log(`[${nickname}] читаю вопрос`);
      void act(GAME_EVENT.read, {}, 2500);
      return;
    }

    if (isHost && state.phase === "host_answer") {
      const bet = pick();
      console.log(`[${nickname}] мой ответ: ${bet}`);
      void act(GAME_EVENT.answer, { bet }, 2500);
      return;
    }

    if (!isHost && state.phase === "betting" && you && !you.hasBet) {
      const bet = pick();
      console.log(`[${nickname}] ставлю ${bet}`);
      void act(GAME_EVENT.bet, { bet }, 4000);
    }
  });

  process.on("SIGINT", () => {
    socket.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

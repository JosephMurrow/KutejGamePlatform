import { io, type Socket } from "socket.io-client";
import { signSessionToken } from "@/lib/auth/token";
import { prisma } from "@/lib/prisma";
import {
  GAME_QUERY,
  ROOM_QUERY,
  SERVER_EVENT,
  SOCKET_PATH,
  type Ack,
  type RoomStatePayload,
} from "@/shared/protocol";
import { createPrivateRoom, deletePrivateRoom } from "@/lib/rooms/private";
import { GAME_EVENT, GAME_ID } from "../protocol";
import { saveRoomSettings } from "../rooms/store";

/**
 * Смоук партии с ботом.
 *
 * Проверяет всю цепочку: комната с ботом заводится, бот садится сам, отвечает
 * ходом на ход и делает это в пределах лимита. Движок — внешняя программа, и
 * без него смоук честно говорит, что проверять нечего.
 *
 * Нужен живой `npm run dev`, база и CHESS_ENGINE_PATH у сервера.
 */

const URL = "http://localhost:3000";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
function check(label: string, condition: boolean, extra = "") {
  if (!condition) failures += 1;
  console.log(
    `  ${condition ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`,
  );
}

interface BotState extends RoomStatePayload {
  phase: string;
  moves: string[];
  turn: string | null;
  fen: string | null;
}

async function main() {
  const human = await prisma.user.upsert({
    where: { login: "chess_vs_bot" },
    create: {
      login: "chess_vs_bot",
      passwordHash: "x",
      nickname: "Человек",
      avatarId: 4,
    },
    update: {},
  });

  const room = await createPrivateRoom(
    human.id,
    {
      kind: "private",
      title: null,
      locked: false,
      maxPlayers: null,
      twitchChannel: null,
    },
    GAME_ID,
  );
  await saveRoomSettings(room.id, {
    timeControl: "MIN_3",
    opponent: "BOT",
    streamerMode: false,
    botLevel: "EASY",
  });

  console.log(`\nКомната ${room.code}: играем с лёгким ботом\n`);

  const states: BotState[] = [];
  const socket: Socket = io(URL, {
    transports: ["websocket"],
    path: SOCKET_PATH,
    extraHeaders: {
      Cookie: `pt_session=${await signSessionToken(human.id, 3600)}`,
    },
    query: { [ROOM_QUERY]: room.code, [GAME_QUERY]: GAME_ID },
    forceNew: true,
  });
  socket.on(SERVER_EVENT.state, (state: BotState) => states.push(state));

  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", (error: Error) => reject(error));
    setTimeout(() => reject(new Error("таймаут подключения")), 5000);
  });

  const emit = (event: string, payload?: unknown): Promise<Ack> =>
    new Promise((resolve) => {
      const args: unknown[] = payload === undefined ? [] : [payload];
      socket.emit(event, ...args, (ack: Ack) => resolve(ack));
      setTimeout(() => resolve({ ok: false, error: "нет ответа" }), 10_000);
    });

  const waitFor = async (
    predicate: (state: BotState) => boolean,
    label: string,
    ms = 15_000,
  ) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const found = states.findLast(predicate);
      if (found) return found;
      await sleep(80);
    }
    return null;
  };

  console.log("[1] Бот садится сам");
  const seated = await waitFor((state) => state.playerCount === 2, "двое");
  check(
    "за доской двое, звать никого не пришлось",
    seated !== null,
    `игроков ${states.at(-1)?.playerCount}`,
  );
  check("партия началась", seated?.phase === "playing", seated?.phase ?? "");

  if (!seated) {
    console.log(
      "\nБот не сел. Если движок не задан переменной CHESS_ENGINE_PATH у сервера,\n" +
        "это ожидаемо: без движка комната ждёт живого соперника.",
    );
    socket.disconnect();
    await deletePrivateRoom(room.id, room.gameId);
    process.exit(1);
  }

  console.log("\n[2] Бот отвечает на ход");
  const started = Date.now();
  const first = await emit(GAME_EVENT.move, { from: "e2", to: "e4", ply: 0 });
  check("человек сходил", first.ok === true, first.error ?? "");

  const answered = await waitFor(
    (state) => state.moves.length >= 2,
    "ответ бота",
  );
  check(
    "бот ответил",
    answered !== null,
    answered ? answered.moves.join(" ") : "не дождались",
  );
  check(
    "ответ пришёл быстрее лимита на ход",
    Date.now() - started < 30_000,
    `${Math.round((Date.now() - started) / 100) / 10} с`,
  );
  check(
    "ход снова за человеком",
    answered?.turn === "white",
    String(answered?.turn),
  );

  console.log("\n[3] Ещё пара ходов");
  const second = await emit(GAME_EVENT.move, { from: "g1", to: "f3", ply: 2 });
  check("второй ход принят", second.ok === true, second.error ?? "");

  const four = await waitFor((state) => state.moves.length >= 4, "четыре хода");
  check("бот ответил снова", four !== null, four ? four.moves.join(" ") : "");

  socket.disconnect();
  await sleep(300);
  await deletePrivateRoom(room.id, room.gameId);

  console.log(
    failures === 0
      ? "\nВсе проверки прошли"
      : `\nПровалено проверок: ${failures}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

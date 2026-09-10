import { io, type Socket } from "socket.io-client";
import { signSessionToken } from "@/lib/auth/token";
import { prisma } from "@/lib/prisma";
import {
  GAME_QUERY,
  ROOM_QUERY,
  SERVER_EVENT,
  SOCKET_PATH,
  type Ack,
  type ChatMessagePayload,
  type RoomStatePayload,
} from "@/shared/protocol";
import { createPrivateRoom, deletePrivateRoom } from "@/lib/rooms/private";
import { GAME_EVENT, GAME_ID } from "../protocol";
import { loadRoomSettings } from "../rooms/store";
import { CHESS_SERVER } from "../server/manifest";
import { MAGNUS_WINS } from "../bots/levels";

/**
 * Смоук скрытого уровня.
 *
 * Проверяет и то, что он открывается только своему аккаунту, и то, что он
 * действительно жульничает: комментирует фигуру, за которую игрок взялся
 * (src/games/chess/docs/BACKLOG.md D3).
 *
 * Нужен живой `npm run dev`, база и движок у сервера.
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

interface State extends RoomStatePayload {
  phase: string;
  moves: string[];
  magnus: boolean;
}

async function person(login: string, nickname: string, expertWins: number) {
  const user = await prisma.user.upsert({
    where: { login },
    create: { login, passwordHash: "x", nickname, avatarId: 1 },
    update: {},
  });
  await prisma.chessRating.upsert({
    where: { userId: user.id },
    create: { userId: user.id, expertWins },
    update: { expertWins },
  });

  return user;
}

/** Комната с выбранным уровнем, заведённая через договор с платформой. */
async function roomFor(hostId: string, wanted: string) {
  const room = await createPrivateRoom(
    hostId,
    {
      kind: "private",
      title: null,
      locked: false,
      maxPlayers: null,
      twitchChannel: null,
    },
    GAME_ID,
  );

  const form = new FormData();
  form.set("timeControl", "MIN_3");
  form.set("opponent", "BOT");
  form.set("botLevel", wanted);
  form.set("viewerDelay", "NONE");
  await CHESS_SERVER.saveRoomSettings(room.id, form);

  return room;
}

async function main() {
  const run = Date.now().toString(36);
  console.log("\nСкрытый уровень\n");

  console.log("[1] Кто его открыл, а кто нет");
  const ready = await person(`chess_mag_${run}_a`, "Мастер", MAGNUS_WINS);
  const notYet = await person(`chess_mag_${run}_b`, "Новичок", MAGNUS_WINS - 1);

  const open = await roomFor(ready.id, "MAGNUS");
  const shut = await roomFor(notYet.id, "MAGNUS");

  check(
    "открывшему достался Магнус",
    (await loadRoomSettings(open.id)).botLevel === "MAGNUS",
  );
  check(
    "остальным — эксперт, кого и надо было обыграть",
    (await loadRoomSettings(shut.id)).botLevel === "EXPERT",
    `${(await loadRoomSettings(shut.id)).botLevel}`,
  );
  await deletePrivateRoom(shut.id, shut.gameId);

  console.log("\n[2] Он садится за доску и признаётся, что видит руку");
  const chat: ChatMessagePayload[] = [];
  const states: State[] = [];
  const socket: Socket = io(URL, {
    transports: ["websocket"],
    path: SOCKET_PATH,
    extraHeaders: {
      Cookie: `pt_session=${await signSessionToken(ready.id, 3600)}`,
    },
    query: { [ROOM_QUERY]: open.code, [GAME_QUERY]: GAME_ID },
    forceNew: true,
  });
  socket.on(SERVER_EVENT.state, (state: State) => states.push(state));
  socket.on(SERVER_EVENT.chatHistory, (history: ChatMessagePayload[]) =>
    chat.push(...history),
  );
  socket.on(SERVER_EVENT.chatMessage, (message: ChatMessagePayload) =>
    chat.push(message),
  );

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

  await sleep(700);
  const seated = states.at(-1);
  check("за доской двое", seated?.playerCount === 2, `${seated?.playerCount}`);
  check(
    "бота зовут Магнусом",
    seated?.players.some((p) => p.nickname === "Магнус") === true,
  );
  check(
    "клиенту сказано, что соперник особенный",
    seated?.magnus === true,
    "без этого он не станет сообщать про руку",
  );

  if (seated?.playerCount !== 2) {
    console.log("\nБот не сел. Без CHESS_ENGINE_PATH у сервера это ожидаемо.");
    socket.disconnect();
    await deletePrivateRoom(open.id, open.gameId);
    process.exit(1);
  }

  console.log("\n[3] Взялся за фигуру — он это заметил");
  // Приёмы включаются не в дебюте: играем несколько ходов.
  const opening = [
    ["e2", "e4"],
    ["g1", "f3"],
    ["f1", "c4"],
    ["e1", "g1"],
    ["d2", "d3"],
  ] as const;
  for (const [from, to] of opening) {
    const state = states.at(-1);
    if (state?.phase !== "playing") break;
    await emit(GAME_EVENT.move, { from, to, ply: state.moves.length });
    await sleep(1500);
  }

  const before = chat.length;
  for (const square of ["b1", "c1", "d1", "f3", "c4"]) {
    await emit(GAME_EVENT.holding, { square });
    await sleep(250);
  }
  await sleep(500);

  const said = chat.slice(before).filter((m) => m.nickname === "Магнус");
  check(
    "сказал, что видит фигуру в руке",
    said.some((m) => /коня|слона|ладью|ферзя|пешку|короля/.test(m.text)),
    said.map((m) => m.text).join(" | ") || "промолчал",
  );

  console.log("\n[4] Событие про руку никуда не уходит");
  const leaked = states.some((state) =>
    JSON.stringify(state).includes('"square"'),
  );
  check("в снимках его нет", !leaked);

  socket.disconnect();
  await sleep(300);
  await deletePrivateRoom(open.id, open.gameId);
  await prisma.user.deleteMany({
    where: { id: { in: [ready.id, notYet.id] } },
  });

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

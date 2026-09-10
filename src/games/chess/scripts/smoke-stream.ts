import { io, type Socket } from "socket.io-client";
import { signSessionToken } from "@/lib/auth/token";
import { prisma } from "@/lib/prisma";
import {
  GAME_QUERY,
  KEY_QUERY,
  ROOM_QUERY,
  SCREEN_VIEW,
  SERVER_EVENT,
  SOCKET_PATH,
  VIEW_QUERY,
  type Ack,
  type RoomStatePayload,
} from "@/shared/protocol";
import { createPrivateRoom, deletePrivateRoom } from "@/lib/rooms/private";
import { GAME_EVENT, GAME_ID } from "../protocol";
import { saveRoomSettings } from "../rooms/store";
import { VIEWER_DELAY_MS } from "../rooms/settings";

/**
 * Смоук режима стримера: задержка для зрителей и экран для трансляции.
 *
 * Проверяется то, ради чего задержка и заведена: зритель на сайте не должен
 * опережать эфир, иначе он подскажет сопернику в чате трансляции
 * (src/games/chess/docs/BACKLOG.md F2). Экран при этом не задерживается — он и
 * есть источник эфира.
 *
 * Нужен живой `npm run dev` и база.
 */

const URL = "http://localhost:3000";
const DELAY = "SEC_15";
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
  streamerMode: boolean;
  viewerDelay: string;
}

class Client {
  readonly states: State[] = [];
  private socket!: Socket;

  constructor(readonly name: string) {}

  async connect(
    token: string | null,
    query: Record<string, string>,
  ): Promise<void> {
    this.socket = io(URL, {
      transports: ["websocket"],
      path: SOCKET_PATH,
      extraHeaders: token ? { Cookie: `pt_session=${token}` } : {},
      query,
      forceNew: true,
    });

    this.socket.on(SERVER_EVENT.state, (state: State) =>
      this.states.push(state),
    );

    await new Promise<void>((resolve, reject) => {
      this.socket.once("connect", () => resolve());
      this.socket.once("connect_error", (error: Error) => reject(error));
      setTimeout(() => reject(new Error("таймаут подключения")), 5000);
    });
  }

  get last(): State | undefined {
    return this.states.at(-1);
  }

  get moves(): string[] {
    return this.last?.moves ?? [];
  }

  emit(event: string, payload?: unknown): Promise<Ack> {
    return new Promise((resolve) => {
      const args: unknown[] = payload === undefined ? [] : [payload];
      this.socket.emit(event, ...args, (ack: Ack) => resolve(ack));
      setTimeout(() => resolve({ ok: false, error: "нет ответа" }), 10_000);
    });
  }

  disconnect(): void {
    this.socket.disconnect();
  }
}

async function person(login: string, nickname: string) {
  return prisma.user.upsert({
    where: { login },
    create: { login, passwordHash: "x", nickname, avatarId: 5 },
    update: {},
  });
}

async function main() {
  const run = Date.now().toString(36);
  const white = await person(`chess_tv_${run}_w`, "Стример");
  const black = await person(`chess_tv_${run}_b`, "Соперник");
  const watcher = await person(`chess_tv_${run}_v`, "Зритель");

  const room = await createPrivateRoom(
    white.id,
    {
      kind: "stream",
      title: "Эфир",
      locked: false,
      maxPlayers: null,
      twitchChannel: null,
    },
    GAME_ID,
  );
  await saveRoomSettings(room.id, {
    timeControl: "MIN_3",
    opponent: "HUMAN",
    streamerMode: true,
    botLevel: "NORMAL",
    viewerDelay: DELAY,
  });

  console.log(`\nКомната ${room.code}: эфир с задержкой ${DELAY}\n`);

  const roomQuery = { [ROOM_QUERY]: room.code, [GAME_QUERY]: GAME_ID };
  const players: Client[] = [];
  for (const [user, name] of [
    [white, "Стример"],
    [black, "Соперник"],
    [watcher, "Зритель"],
  ] as const) {
    const client = new Client(name);
    await client.connect(await signSessionToken(user.id, 3600), roomQuery);
    players.push(client);
    await sleep(120);
  }
  const [playing, opponent, viewer] = players as [Client, Client, Client];

  console.log("[1] Комната собралась");
  await sleep(400);
  check("партия идёт", playing.last?.phase === "playing", playing.last?.phase);
  check(
    "режим стримера доехал до клиента",
    playing.last?.streamerMode === true,
  );
  check("задержка тоже", playing.last?.viewerDelay === DELAY);
  check("зритель не за столом", viewer.last?.playerCount === 2);

  console.log("\n[2] Экран пускают по ключу без сессии");
  const screen = new Client("Экран");
  await screen.connect(null, {
    ...roomQuery,
    [VIEW_QUERY]: SCREEN_VIEW,
    [KEY_QUERY]: room.screenKey,
  });
  await sleep(400);
  check("экран подключился", screen.last?.isScreen === true);

  console.log("\n[3] Ход: игрок видит сразу, зритель — нет");
  const ack = await playing.emit(GAME_EVENT.move, {
    from: "e2",
    to: "e4",
    ply: 0,
  });
  check("ход принят", ack.ok === true, ack.error ?? "");
  await sleep(500);

  check("игрок видит свой ход", playing.moves.length === 1, `${playing.moves}`);
  check("соперник тоже", opponent.moves.length === 1, `${opponent.moves}`);
  check(
    "экран не задержан: он и есть источник эфира",
    screen.moves.length === 1,
    `${screen.moves}`,
  );
  check("зритель ещё не видит", viewer.moves.length === 0, `${viewer.moves}`);

  console.log("\n[4] Через задержку ход доезжает и до зрителя");
  const wait = VIEWER_DELAY_MS[DELAY];
  console.log(`  … ждём ${wait / 1000} с`);
  await sleep(wait + 1500);

  check("зритель увидел ход", viewer.moves.length === 1, `${viewer.moves}`);
  check(
    "снимок пришёл сам, без единого действия",
    viewer.states.length > 1,
    `снимков ${viewer.states.length}`,
  );

  for (const client of [...players, screen]) client.disconnect();
  await sleep(300);
  await deletePrivateRoom(room.id, room.gameId);
  await prisma.user.deleteMany({
    where: { id: { in: [white.id, black.id, watcher.id] } },
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

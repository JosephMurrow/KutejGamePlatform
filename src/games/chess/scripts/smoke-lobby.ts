import { io, type Socket } from "socket.io-client";
import { signSessionToken } from "@/lib/auth/token";
import { prisma } from "@/lib/prisma";
import {
  GAME_QUERY,
  SERVER_EVENT,
  SOCKET_PATH,
  type Ack,
  type RoomStatePayload,
} from "@/shared/protocol";
import { GAME_EVENT, GAME_ID } from "../protocol";

/**
 * Смоук общего зала: толпа садится парами и играет одновременно.
 *
 * Проверяется главное, чего нет в комнате на двоих: одна платформенная комната
 * ведёт много досок, ходы одной пары не попадают в чужую партию, нечётный ждёт
 * в очереди и может из неё выйти (src/games/chess/docs/BACKLOG.md A1).
 *
 * Нужен живой `npm run dev` и база.
 */

const URL = "http://localhost:3000";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Сколько человек приводим в зал. Нечётное намеренно: последний ждёт. */
const CROWD = Number(process.argv[2] ?? 7);

let failures = 0;
function check(label: string, condition: boolean, extra = "") {
  if (!condition) failures += 1;
  console.log(
    `  ${condition ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`,
  );
}

interface LobbyPlayer {
  id: string;
  color?: string;
}

interface LobbyState extends RoomStatePayload<
  LobbyPlayer & { nickname: string; avatarId: number; isGuest: boolean }
> {
  phase: string;
  moves: string[];
  turn: string | null;
  queued?: boolean;
  lobby?: { waiting: number; boards: number; present: number };
}

class Player {
  readonly states: LobbyState[] = [];
  private socket!: Socket;

  constructor(
    readonly id: string,
    readonly name: string,
  ) {}

  async connect(token: string): Promise<void> {
    this.socket = io(URL, {
      transports: ["websocket"],
      extraHeaders: { Cookie: `pt_session=${token}` },
      query: { [GAME_QUERY]: GAME_ID },
      path: SOCKET_PATH,
      forceNew: true,
    });

    this.socket.on(SERVER_EVENT.state, (state: LobbyState) =>
      this.states.push(state),
    );

    await new Promise<void>((resolve, reject) => {
      this.socket.once("connect", () => resolve());
      this.socket.once("connect_error", (error: Error) => reject(error));
      setTimeout(() => reject(new Error("таймаут подключения")), 5000);
    });
  }

  get last(): LobbyState | undefined {
    return this.states.at(-1);
  }

  emit(event: string, payload?: unknown): Promise<Ack> {
    return new Promise((resolve) => {
      const args: unknown[] = payload === undefined ? [] : [payload];
      this.socket.emit(event, ...args, (ack: Ack) => resolve(ack));
      // На толпе ответ идёт дольше: рассылка склеивается в кадр, и подтверждение
      // ждёт своей очереди вместе с ним.
      setTimeout(() => resolve({ ok: false, error: "нет ответа" }), 10_000);
    });
  }

  disconnect(): void {
    this.socket.disconnect();
  }

  async waitState(
    predicate: (state: LobbyState) => boolean,
    label: string,
  ): Promise<LobbyState> {
    const until = Date.now() + 6000;
    while (Date.now() < until) {
      const found = this.states.findLast(predicate);
      if (found) return found;
      await sleep(50);
    }
    throw new Error(`${this.name}: не дождался «${label}»`);
  }
}

async function main() {
  console.log(`\nОбщий зал: приводим ${CROWD} человек\n`);

  // Люди на каждый прогон свои. Зал живёт в памяти сервера, и вернувшийся
  // садится обратно за свою недоигранную доску — это правильно для игры, но
  // предыдущий прогон тогда мешает следующему.
  const run = Date.now().toString(36);
  const players: Player[] = [];
  for (let at = 0; at < CROWD; at++) {
    const user = await prisma.user.upsert({
      where: { login: `chess_crowd_${run}_${at}` },
      create: {
        login: `chess_crowd_${run}_${at}`,
        passwordHash: "x",
        nickname: `Игрок ${at + 1}`,
        avatarId: at % 40,
      },
      update: {},
    });
    const player = new Player(user.id, user.nickname);
    await player.connect(await signSessionToken(user.id, 3600));
    // По одному: так проверяется и то, что пары складываются по мере прихода.
    await sleep(150);
    players.push(player);
  }

  console.log("[1] Посадка парами");
  // Рассылка склеивается в кадр, а подключений много: ждём, пока последний
  // снимок доедет до всех.
  await sleep(400 + CROWD * 60);

  const playing = players.filter((p) => p.last?.phase === "playing");
  const queued = players.filter((p) => p.last?.phase === "queue");
  const pairs = Math.floor(CROWD / 2);

  // Зал общий и живёт в памяти сервера: в нём могут дожидаться отсрочки люди
  // из прошлого прогона. Поэтому свои проверяются точно, а зал — «не меньше».
  check(
    "сели все, кому нашлась пара",
    playing.length >= pairs * 2 - 1,
    `за досками ${playing.length} из ${CROWD}`,
  );
  check(
    "никто не потерялся",
    playing.length + queued.length === CROWD,
    `${playing.length} за досками, ${queued.length} в очереди`,
  );

  const summary = players[0]?.last?.lobby;
  check(
    "зал считает партии",
    (summary?.boards ?? 0) >= pairs,
    `партий ${summary?.boards} при ${pairs} наших`,
  );
  check(
    "зал считает народ",
    (summary?.present ?? 0) >= CROWD,
    `в зале ${summary?.present}`,
  );

  console.log("\n[2] Партии идут независимо");
  // Первый ход делает белый каждой пары. Цвет берётся у себя в составе:
  // порядок в списке платформенный, и полагаться на него нельзя, а `turn`
  // одинаков у обоих.
  // Каждой доске свой дебют: так видно, что ходы не перепутались между ними.
  const openings = [
    "a2a3",
    "b2b3",
    "c2c3",
    "d2d3",
    "e2e3",
    "f2f3",
    "g2g3",
    "h2h3",
    "g1f3",
    "b1c3",
    "a2a4",
    "b2b4",
    "c2c4",
    "d2d4",
    "e2e4",
  ];
  const movers = playing.filter(
    (p) =>
      p.last?.players.find((entry) => entry.id === p.id)?.color === "white",
  );

  let moved = 0;
  for (const [at, player] of movers.entries()) {
    const opening = openings[at % openings.length] as string;
    const ack = await player.emit(GAME_EVENT.move, {
      from: opening.slice(0, 2),
      to: opening.slice(2),
      ply: 0,
    });
    if (ack.ok) moved += 1;
    // Врозь, а не залпом: десять ходов в одну миллисекунду — не игра, а
    // нагрузочный тест, и подтверждение у одного из них опаздывает.
    await sleep(40);
  }
  check(
    "сходили все белые",
    moved === movers.length,
    `${moved} из ${movers.length}`,
  );

  await sleep(700);
  const boards = new Set(
    playing.map((p) => p.last?.moves.join(" ")).filter(Boolean),
  );
  check(
    "у каждой доски свои ходы",
    boards.size === Math.min(movers.length, openings.length),
    `разных партий ${boards.size} при ${movers.length} досках`,
  );
  check(
    "никто не увидел чужой ход в своей партии",
    playing.every((p) => (p.last?.moves.length ?? 0) <= 1),
    "ни у кого не больше одного хода",
  );

  console.log("\n[3] Очередь");
  const waiter = queued[0];
  if (waiter) {
    check("ждущий помечен очередью", waiter.last?.queued === true);

    const left = await waiter.emit(GAME_EVENT.leaveQueue);
    check("из очереди можно выйти", left.ok === true, left.error ?? "");

    const after = await waiter.waitState(
      (state) => state.queued === false,
      "вышел из очереди",
    );
    check("зал это заметил", after.lobby?.waiting === 0);

    const again = await waiter.emit(GAME_EVENT.rematch);
    check("и вернуться обратно", again.ok === true, again.error ?? "");
  } else {
    check("нечётного нет — проверять очередь не на ком", true);
  }

  for (const player of players) player.disconnect();
  await sleep(300);

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

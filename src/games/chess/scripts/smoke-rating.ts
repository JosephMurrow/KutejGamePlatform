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
import { applyMatch } from "../rating/apply";
import { loadBoard } from "../leaderboard/board";
import { START_RATING } from "../rating/glicko";

/**
 * Смоук рейтинга: партия в общем зале меняет рейтинг обоих, партия с ботом не
 * меняет ничего.
 *
 * Двое садятся в зале и играют партию до мата — не учебные четыре хода, а
 * настоящую, чтобы прошли и рейтинг, и надбавка: за победу она даётся только в
 * состоявшейся партии (src/games/chess/docs/BACKLOG.md E2).
 *
 * Нужен живой `npm run dev` и база.
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

/**
 * Партия Морфи с герцогом Брауншвейгским, 1858. Тридцать три полухода и мат —
 * ровно то, что нужно: и рейтинг посчитается, и надбавка причитается.
 */
const OPERA = [
  "e2e4",
  "e7e5",
  "g1f3",
  "d7d6",
  "d2d4",
  "c8g4",
  "d4e5",
  "g4f3",
  "d1f3",
  "d6e5",
  "f1c4",
  "g8f6",
  "f3b3",
  "d8e7",
  "b1c3",
  "c7c6",
  "c1g5",
  "b7b5",
  "c3b5",
  "c6b5",
  "c4b5",
  "b8d7",
  "e1c1",
  "a8d8",
  "d1d7",
  "d8d7",
  "h1d1",
  "e7e6",
  "b5d7",
  "f6d7",
  "b3b8",
  "d7b8",
  "d1d8",
];

interface Seat {
  id: string;
  nickname: string;
  avatarId: number;
  isGuest: boolean;
  color?: string;
}

interface State extends RoomStatePayload<Seat> {
  phase: string;
  moves: string[];
  turn: string | null;
  result: string | null;
  reason: string | null;
}

class Player {
  readonly states: State[] = [];
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

  /** Свой цвет: порядок в составе платформенный, полагаться на него нельзя. */
  get color(): string | undefined {
    return this.last?.players.find((seat) => seat.id === this.id)?.color;
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

async function newcomer(login: string, nickname: string): Promise<Player> {
  const user = await prisma.user.upsert({
    where: { login },
    create: { login, passwordHash: "x", nickname, avatarId: 7 },
    update: {},
  });

  const player = new Player(user.id, nickname);
  await player.connect(await signSessionToken(user.id, 3600));

  return player;
}

async function ratingOf(userId: string) {
  return prisma.chessRating.findUnique({ where: { userId } });
}

async function main() {
  const run = Date.now().toString(36);
  console.log("\nРейтинг: партия в общем зале\n");

  console.log("[1] Двое садятся за доску");

  // Зал общий и живёт в памяти сервера: в нём может дожидаться отсрочки народ
  // из соседнего смоука, и тогда наши сядут не друг с другом. Ждём, пока
  // первый окажется именно в очереди — значит, зал пуст.
  let white: Player | null = null;
  for (let tries = 0; tries < 8 && !white; tries += 1) {
    const first = await newcomer(`chess_rate_${run}_a`, "Морфи");
    await sleep(400);

    if (first.last?.phase === "queue") {
      white = first;
      break;
    }

    first.disconnect();
    console.log("  … в зале кто-то есть, ждём");
    await sleep(4000);
  }

  if (!white) {
    console.log("\nЗал занят соседним прогоном. Повторите через полминуты.");
    process.exit(1);
  }

  const black = await newcomer(`chess_rate_${run}_b`, "Герцог");
  await sleep(600);

  const first = white.color === "white" ? white : black;
  const second = first === white ? black : white;

  check(
    "пара сложилась и партия пошла",
    first.last?.phase === "playing" && first.color === "white",
    `${first.name} — ${first.color}`,
  );

  if (first.last?.phase !== "playing") {
    white.disconnect();
    black.disconnect();
    process.exit(1);
  }

  console.log("\n[2] Партия Морфи, тридцать три полухода до мата");
  for (const [ply, move] of OPERA.entries()) {
    const mover = ply % 2 === 0 ? first : second;
    const ack = await mover.emit(GAME_EVENT.move, {
      from: move.slice(0, 2),
      to: move.slice(2, 4),
      ply,
    });

    if (!ack.ok) {
      check(`ход ${ply + 1} (${move}) принят`, false, ack.error ?? "");
      break;
    }
    await sleep(30);
  }
  await sleep(500);

  // Доска в зале доигранной не держится: снимок после конца партии — уже про
  // зал. Итог ищем в истории снимков, а не в последнем.
  const over = first.states.findLast((state) => state.reason !== null);
  check(
    "партия кончилась матом",
    over?.reason === "checkmate",
    over?.reason ?? "итога не было",
  );
  check("выиграли белые", over?.result === "white", over?.result ?? "");

  console.log("\n[3] Рейтинг обоих изменился");
  await sleep(600);
  const [win, loss] = await Promise.all([
    ratingOf(first.id),
    ratingOf(second.id),
  ]);

  check(
    "победителю рейтинг подняли",
    (win?.rating ?? START_RATING) > START_RATING,
    `${win?.rating?.toFixed(1)}`,
  );
  check(
    "проигравшему опустили",
    (loss?.rating ?? START_RATING) < START_RATING,
    `${loss?.rating?.toFixed(1)}`,
  );
  check(
    "отклонение упало: система стала увереннее",
    (win?.deviation ?? 350) < 350,
    `${win?.deviation?.toFixed(1)}`,
  );
  check("партия зачлась обоим", win?.games === 1 && loss?.games === 1);
  check(
    "победителю досталась полная надбавка",
    win?.bonus === 1,
    `${win?.bonus}`,
  );
  check("проигравшему надбавки нет", loss?.bonus === 0, `${loss?.bonus}`);

  const [lowId, highId] =
    first.id < second.id ? [first.id, second.id] : [second.id, first.id];
  const pair = await prisma.chessPair.findUnique({
    where: { lowId_highId: { lowId, highId } },
  });
  check("пара посчитана", pair?.games === 1, `${pair?.games}`);

  console.log("\n[4] Партия записана с рейтингами на момент партии");
  const match = await prisma.chessMatch.findFirst({
    where: { whiteId: first.id, blackId: second.id },
    orderBy: { endedAt: "desc" },
  });
  check("партия в базе", match !== null);
  check(
    "рейтинги записаны те, с которыми садились",
    match?.whiteRating === START_RATING && match?.blackRating === START_RATING,
    `${match?.whiteRating} и ${match?.blackRating}`,
  );
  check("ходы записаны целиком", match?.moves.length === OPERA.length);

  console.log("\n[5] Партия с ботом не меняет ничего");
  const before = await ratingOf(first.id);
  await applyMatch({
    roomKey: "chess-room-with-bot",
    whiteId: first.id,
    blackId: "bot:smoke",
    result: "white",
    reason: "checkmate",
    plies: 40,
    botId: "bot:smoke",
  });
  const after = await ratingOf(first.id);

  check("рейтинг не двинулся", after?.rating === before?.rating);
  check("надбавки не дали", after?.bonus === before?.bonus);
  check("партия не зачлась", after?.games === before?.games);
  check(
    "победа над ботом посчитана отдельно",
    after?.botWins === (before?.botWins ?? 0) + 1,
    `${after?.botWins}`,
  );

  console.log("\n[6] Таблица");
  const board = await loadBoard(first.id);
  const mine = [...board.rows, board.you].find(
    (row) => row?.userId === first.id,
  );
  check("игрок в зачёте", mine !== undefined);
  check(
    "провизорный в верхушку не пущен",
    mine?.provisional !== true ||
      board.rows.every((row) => row.userId !== first.id),
    `отклонение после одной партии высокое`,
  );
  check(
    "суммарный — это рейтинг плюс надбавка",
    Math.abs((mine?.sum ?? 0) - ((win?.rating ?? 0) + (win?.bonus ?? 0))) < 0.1,
    `${mine?.sum}`,
  );

  white.disconnect();
  black.disconnect();
  await sleep(300);

  // За собой убираем: рейтинг и пары уедут каскадом вместе с людьми.
  await prisma.chessMatch.deleteMany({
    where: { OR: [{ whiteId: first.id }, { whiteId: second.id }] },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [first.id, second.id] } },
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

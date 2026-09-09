import { io, type Socket } from "socket.io-client";
import { signSessionToken } from "@/lib/auth/token";
import { prisma } from "@/lib/prisma";
import {
  GAME_QUERY,
  ROOM_QUERY,
  SERVER_EVENT,
  type Ack,
  type RoomStatePayload,
} from "@/shared/protocol";
import { createPrivateRoom, deletePrivateRoom } from "@/lib/rooms/private";
import { GAME_EVENT, GAME_ID } from "../protocol";
import { saveRoomSettings } from "../rooms/store";

/**
 * Смоук шахмат: двое играют партию по сокету, третий смотрит.
 *
 * Юниты не покрывают ни сокет, ни менеджер комнат, ни подъём комнаты из базы —
 * это зона смоуков (docs/TESTING.md). Здесь проверяется вся цепочка целиком:
 * подключение с игрой в запросе, посадка двоих, ходы, отказы, восстановление
 * после переподключения и конец партии.
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

/** Игровая часть снимка: платформа её не разбирает, а мы разбираем. */
interface ChessState extends RoomStatePayload {
  phase: string;
  fen: string | null;
  turn: string | null;
  moves: string[];
  result: string | null;
  reason: string | null;
}

class Client {
  readonly states: ChessState[] = [];
  private socket!: Socket;

  constructor(readonly name: string) {}

  async connect(token: string, code: string): Promise<void> {
    this.socket = io(URL, {
      transports: ["websocket"],
      extraHeaders: { Cookie: `pt_session=${token}` },
      query: { [ROOM_QUERY]: code, [GAME_QUERY]: GAME_ID },
      forceNew: true,
    });

    this.socket.on(SERVER_EVENT.state, (state: ChessState) => {
      this.states.push(state);
    });

    await new Promise<void>((resolve, reject) => {
      this.socket.once("connect", () => resolve());
      this.socket.once("connect_error", (error: Error) => reject(error));
      setTimeout(() => reject(new Error("таймаут подключения")), 5000);
    });
  }

  get last(): ChessState | undefined {
    return this.states.at(-1);
  }

  emit(event: string, payload?: unknown): Promise<Ack> {
    return new Promise((resolve) => {
      const args: unknown[] = payload === undefined ? [] : [payload];
      this.socket.emit(event, ...args, (ack: Ack) => resolve(ack));
      setTimeout(() => resolve({ ok: false, error: "нет ответа" }), 3000);
    });
  }

  disconnect(): void {
    this.socket.disconnect();
  }

  async waitState(
    predicate: (state: ChessState) => boolean,
    label: string,
  ): Promise<ChessState> {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const found = this.states.findLast(predicate);
      if (found) return found;
      await sleep(50);
    }
    throw new Error(`${this.name}: не дождался состояния «${label}»`);
  }
}

async function ensureUser(login: string, nickname: string, avatarId: number) {
  return prisma.user.upsert({
    where: { login },
    create: { login, passwordHash: "x", nickname, avatarId },
    update: { nickname, avatarId },
    select: { id: true, nickname: true },
  });
}

/** Ход: координаты и номер полухода, каким его считает клиент. */
function move(from: string, to: string, ply: number) {
  return { from, to, ply };
}

async function main() {
  const white = await ensureUser("chess_white", "Белые", 1);
  const black = await ensureUser("chess_black", "Чёрные", 2);
  const guest = await ensureUser("chess_viewer", "Зритель", 3);

  const tokens = {
    white: await signSessionToken(white.id, 3600),
    black: await signSessionToken(black.id, 3600),
    guest: await signSessionToken(guest.id, 3600),
  };

  const room = await createPrivateRoom(
    white.id,
    {
      kind: "private",
      title: "Смоук",
      locked: false,
      // Лимит держит движок, а не платформа: зрителей пускать надо
      // (src/games/chess/docs/BACKLOG.md A3).
      maxPlayers: null,
      twitchChannel: null,
    },
    GAME_ID,
  );
  await saveRoomSettings(room.id, {
    timeControl: "MIN_3",
    opponent: "HUMAN",
    streamerMode: false,
  });

  console.log(`\nКомната ${room.code}, три минуты на ход\n`);

  console.log("[1] Посадка");
  const a = new Client("Белые");
  const b = new Client("Чёрные");
  const viewer = new Client("Зритель");

  await a.connect(tokens.white, room.code);
  await a.waitState((state) => state.playerCount >= 1, "сел первый");
  await b.connect(tokens.black, room.code);
  const seated = await b.waitState(
    (state) => state.playerCount === 2,
    "сели двое",
  );
  await viewer.connect(tokens.guest, room.code);
  await sleep(300);

  check("двое за доской", seated.playerCount === 2);
  check("партия началась", seated.phase === "playing", seated.phase);
  check(
    "третий подключился зрителем",
    viewer.last?.playerCount === 2,
    `игроков ${viewer.last?.playerCount}`,
  );
  check(
    "цвета розданы по порядку посадки",
    seated.players[0]?.id === white.id && seated.players[1]?.id === black.id,
  );
  check("часы пущены", (seated.deadline ?? 0) > Date.now());

  console.log("\n[2] Ходы");
  const first = await a.emit(GAME_EVENT.move, move("e2", "e4", 0));
  check("белые сходили", first.ok === true, first.error ?? "");

  const outOfTurn = await a.emit(GAME_EVENT.move, move("d2", "d4", 1));
  check("подряд ходить нельзя", outOfTurn.ok === false, outOfTurn.error ?? "");

  const fromViewer = await viewer.emit(GAME_EVENT.move, move("e7", "e5", 1));
  check(
    "зритель ходить не может",
    fromViewer.ok === false,
    fromViewer.error ?? "",
  );

  await b.emit(GAME_EVENT.move, move("e7", "e5", 1));
  const afterTwo = await a.waitState(
    (state) => state.moves?.length === 2,
    "два хода",
  );
  check(
    "оба хода на доске",
    afterTwo.moves.join(" ") === "e4 e5",
    afterTwo.moves.join(" "),
  );
  check(
    "ход перешёл к белым",
    afterTwo.turn === "white",
    String(afterTwo.turn),
  );

  const stale = await a.emit(GAME_EVENT.move, move("g1", "f3", 0));
  check("ход с чужим номером отбит", stale.ok === false, stale.error ?? "");

  const illegal = await a.emit(GAME_EVENT.move, move("g1", "g4", 2));
  check(
    "нелегальный ход отбит внятно",
    illegal.ok === false,
    illegal.error ?? "",
  );

  console.log("\n[3] Зритель видит партию");
  const seen = await viewer.waitState(
    (state) => state.moves?.length === 2,
    "зритель видит ходы",
  );
  check("зрителю приходит позиция", typeof seen.fen === "string");
  check("зритель не за столом", seen.playerCount === 2);

  console.log("\n[4] Переподключение");
  b.disconnect();
  await sleep(300);
  const back = new Client("Чёрные снова");
  await back.connect(tokens.black, room.code);
  const restored = await back.waitState(
    (state) => state.moves?.length === 2,
    "состояние восстановлено",
  );
  check("после реконнекта пришла вся партия", restored.moves.length === 2);
  check("место осталось за игроком", restored.playerCount === 2);
  check("партия идёт", restored.phase === "playing", restored.phase);

  console.log("\n[5] Конец партии");
  const resigned = await a.emit(GAME_EVENT.resign);
  check("белые сдались", resigned.ok === true, resigned.error ?? "");

  const over = await back.waitState((state) => state.phase === "over", "конец");
  check("партия кончилась", over.phase === "over");
  check("победа чёрных", over.result === "black", String(over.result));
  check("причина названа", over.reason === "resign", String(over.reason));
  check("часы погашены", over.deadline === null);

  const afterEnd = await a.emit(GAME_EVENT.move, move("d2", "d4", 2));
  check(
    "после конца ходить нельзя",
    afterEnd.ok === false,
    afterEnd.error ?? "",
  );

  a.disconnect();
  back.disconnect();
  viewer.disconnect();
  await sleep(300);

  await deletePrivateRoom(room.id, room.gameId);
  const leftovers = await prisma.chessRoomSettings.count({
    where: { roomId: room.id },
  });
  check("настройки ушли вместе с комнатой", leftovers === 0);

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

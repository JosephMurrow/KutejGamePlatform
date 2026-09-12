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
import { CHARACTER_TRAITS } from "../bots/characters";
import { LINES } from "../bots/lines";
import { GAME_EVENT, GAME_ID } from "../protocol";
import { saveRoomSettings } from "../rooms/store";

/**
 * Смоук турбо-шахмат: двое играют партию по сокету, третий смотрит.
 *
 * Юниты не покрывают ни сокет, ни менеджер комнат, ни подъём комнаты из базы —
 * это зона смоуков (docs/TESTING.md). Здесь проверяется вся цепочка целиком:
 * подключение с игрой в запросе, посадка двоих, ходы, отказы, восстановление
 * после переподключения, конец партии, запись в базу и реванш.
 *
 * Партия идёт в служебной «Классике»: правила остальных режимов меняются на
 * их этапах, а этой проверке меняться незачем. Сценарий — копия шахматного
 * (src/games/chess/scripts/smoke-chess.ts): игра не импортирует игру.
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
interface TurboState extends RoomStatePayload {
  phase: string;
  mode: string | null;
  position: { board: unknown[] } | null;
  turn: number | null;
  moves: string[];
  result: number | "draw" | null;
  reason: string | null;
}

class Client {
  readonly states: TurboState[] = [];
  /** Что сказали в чате: по этому видно, что бот заговорил. */
  readonly chat: { playerId: string; nickname: string; text: string }[] = [];
  private socket!: Socket;

  constructor(readonly name: string) {}

  async connect(token: string, code: string): Promise<void> {
    this.socket = io(URL, {
      transports: ["websocket"],
      extraHeaders: { Cookie: `pt_session=${token}` },
      query: { [ROOM_QUERY]: code, [GAME_QUERY]: GAME_ID },
      forceNew: true,
    });

    this.socket.on(SERVER_EVENT.state, (state: TurboState) => {
      this.states.push(state);
    });

    this.socket.on(
      SERVER_EVENT.chatMessage,
      (message: { playerId: string; nickname: string; text: string }) => {
        this.chat.push(message);
      },
    );

    await new Promise<void>((resolve, reject) => {
      this.socket.once("connect", () => resolve());
      this.socket.once("connect_error", (error: Error) => reject(error));
      setTimeout(() => reject(new Error("таймаут подключения")), 5000);
    });
  }

  get last(): TurboState | undefined {
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

  /** Дождаться, пока в чате наберётся столько реплик; реплики «печатаются». */
  async waitChatAtLeast(count: number, ms = 8000): Promise<boolean> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (this.chat.length >= count) return true;
      await sleep(100);
    }
    return false;
  }

  /** Дождаться реплики в чате; пусто — значит бот промолчал. */
  async waitChat(
    label: string,
    ms = 8000,
  ): Promise<(typeof this.chat)[number] | null> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const found = this.chat.at(-1);
      if (found) return found;
      await sleep(100);
    }
    console.log(`  … ${label}: чат молчит`);
    return null;
  }

  async waitState(
    predicate: (state: TurboState) => boolean,
    label: string,
  ): Promise<TurboState> {
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
  const white = await ensureUser("turbo_white", "Белые", 1);
  const black = await ensureUser("turbo_black", "Чёрные", 2);
  const guest = await ensureUser("turbo_viewer", "Зритель", 3);

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
      // Лимит держит движок, а не платформа: зрителей пускать надо.
      maxPlayers: null,
      twitchChannel: null,
    },
    GAME_ID,
  );
  await saveRoomSettings(room.id, {
    mode: "CLASSIC",
    timeControl: "MIN_3",
    options: {},
    bots: 0,
    botLevel: "normal",
  });

  console.log(`\nКомната ${room.code}, классика, три минуты на ход\n`);

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
    "места розданы по порядку посадки",
    seated.players[0]?.id === white.id && seated.players[1]?.id === black.id,
  );
  check("режим — классика", seated.mode === "CLASSIC", String(seated.mode));
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
  check("ход перешёл к белым", afterTwo.turn === 0, String(afterTwo.turn));

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
  check(
    "зрителю приходит позиция",
    seen.position?.board.length === 64,
    `клеток ${seen.position?.board.length}`,
  );
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
  check("победа чёрных", over.result === 1, String(over.result));
  check("причина названа", over.reason === "resign", String(over.reason));
  check("часы погашены", over.deadline === null);

  const afterEnd = await a.emit(GAME_EVENT.move, move("d2", "d4", 2));
  check(
    "после конца ходить нельзя",
    afterEnd.ok === false,
    afterEnd.error ?? "",
  );

  console.log("\n[6] Партия в базе");
  await sleep(600);
  const saved = await prisma.turboMatch.findFirst({
    where: { roomKey: room.id },
    orderBy: { endedAt: "desc" },
    include: { seats: { orderBy: { seat: "asc" } } },
  });
  check("партия записана", saved !== null);
  check(
    "ходы сохранены",
    saved?.moves.join(" ") === "e4 e5",
    saved?.moves.join(" ") ?? "",
  );
  check(
    "время на каждый ход записано",
    saved?.times.length === saved?.moves.length,
    `${saved?.times.length} против ${saved?.moves.length}`,
  );
  check(
    "результат и причина на месте",
    saved?.winner === 1 && saved?.reason === "resign",
    `${saved?.winner} / ${saved?.reason}`,
  );
  check(
    "места и ники записаны на момент партии",
    saved?.seats[0]?.userId === white.id &&
      saved?.seats[0]?.name === white.nickname &&
      saved?.seats[1]?.name === black.nickname,
    saved?.seats.map((seat) => seat.name).join(" · ") ?? "",
  );
  check(
    "режим и зерно случайности записаны",
    saved?.mode === "CLASSIC" && Number.isInteger(saved?.seed),
    `${saved?.mode} / ${saved?.seed}`,
  );

  console.log("\n[7] Реванш");
  const again = await back.emit(GAME_EVENT.rematch);
  check("реванш принят", again.ok === true, again.error ?? "");

  const restarted = await back.waitState(
    (state) => state.phase === "playing" && state.moves.length === 0,
    "новая партия",
  );
  check("доска чистая", restarted.moves.length === 0);
  check(
    "места поменялись",
    restarted.players[0]?.id === black.id,
    restarted.players[0]?.id === black.id
      ? "белыми теперь бывшие чёрные"
      : "места те же",
  );

  a.disconnect();
  back.disconnect();
  viewer.disconnect();
  await sleep(300);

  console.log("\n[8] Соперник-программа");

  /**
   * Характеры за столом выпадают по ключу комнаты, а колоды реплик пишутся по
   * одному характеру за раз — значит бот с готовой колодой попадается не сразу.
   * Заводим комнаты, пока не сядет говорящий: молчащий бот проверку речи не
   * проверит, а проверить её надо.
   */
  const talkative = new Set(
    Object.entries(LINES).flatMap(([character, lines]) =>
      lines && Object.keys(lines).length > 0 ? [character] : [],
    ),
  );
  const nicknames = new Map(
    Object.values(CHARACTER_TRAITS).flatMap((traits) =>
      traits.nicknames.map((nick) => [nick, traits.id] as const),
    ),
  );

  let botRoom = null as Awaited<ReturnType<typeof createPrivateRoom>> | null;
  let human = null as Client | null;
  let bot: { id: string; nickname: string } | undefined;

  for (let attempt = 0; attempt < 16 && !bot; attempt++) {
    const candidate = await createPrivateRoom(
      white.id,
      {
        kind: "private",
        title: "Смоук с программой",
        locked: false,
        maxPlayers: null,
        twitchChannel: null,
      },
      GAME_ID,
    );
    await saveRoomSettings(candidate.id, {
      mode: "CLASSIC",
      timeControl: "MIN_3",
      options: {},
      bots: 1,
      botLevel: "easy",
    });

    const client = new Client("человек");
    await client.connect(tokens.white, candidate.code);
    const seatedWithBot = await client.waitState(
      (state) => state.phase === "playing",
      "партия с программой",
    );
    const seatedBot = seatedWithBot.players.find(
      (player) => player.id !== white.id,
    );
    const character = nicknames.get(seatedBot?.nickname ?? "");

    if (seatedBot && character && talkative.has(character)) {
      botRoom = candidate;
      human = client;
      bot = seatedBot;
      break;
    }

    client.disconnect();
    await sleep(150);
    await deletePrivateRoom(candidate.id, candidate.gameId);
  }

  check("программа села за стол", bot !== undefined && human !== null);
  if (!bot || !human || !botRoom) {
    console.log("  … говорящего характера не выпало за шестнадцать попыток");
  } else {
    check("у неё свой ник", bot.nickname.length > 0, bot.nickname);

    const hello = await human.waitChat("приветствие программы");
    check("программа поздоровалась в чате", hello !== null, hello?.text ?? "");
    check(
      "реплика от её имени, а не от игры",
      hello?.playerId === bot.id && hello?.nickname === bot.nickname,
      hello?.nickname ?? "",
    );

    const opened = await human.emit(GAME_EVENT.move, move("e2", "e4", 0));
    check("человек сходил", opened.ok === true, opened.error ?? "");

    const answered = await human.waitState(
      (state) => state.moves.length === 2,
      "ответ программы",
    );
    check(
      "программа ответила сама",
      answered.moves.length === 2,
      answered.moves.join(" "),
    );
    check("ход вернулся человеку", answered.turn === 0, String(answered.turn));
    check("часы идут дальше", (answered.deadline ?? 0) > Date.now());

    const botResign = await human.emit(GAME_EVENT.resign);
    check("человек сдался", botResign.ok === true, botResign.error ?? "");
    const botOver = await human.waitState(
      (state) => state.phase === "over",
      "конец партии с программой",
    );
    check("победа за программой", botOver.result === 1, String(botOver.result));
    // Реплики не мгновенные: их «печатают», и последнюю надо дождаться.
    const spokeAgain = await human.waitChatAtLeast(2);
    check(
      "на прощание программа что-то сказала",
      spokeAgain,
      human.chat.at(-1)?.text ?? "",
    );

    await sleep(300);
    const botMatch = await prisma.turboMatch.findFirst({
      where: { roomKey: botRoom.id },
      include: { seats: true },
    });
    check("партия с программой записана", botMatch !== null);
    check(
      "место программы в запись мест не попало",
      botMatch?.seats.length === 1 && botMatch.seats[0]?.userId === white.id,
      `мест записано: ${botMatch?.seats.length ?? 0}`,
    );
    const recorded = (botMatch?.bots ?? []) as {
      seat: number;
      level: string;
    }[];
    check(
      "зато записано, кто был программой",
      recorded.length === 1 && recorded[0]?.seat === 1,
      recorded
        .map((one) => `место ${one.seat}, уровень ${one.level}`)
        .join("; "),
    );

    human.disconnect();
    await sleep(200);
    await deletePrivateRoom(botRoom.id, botRoom.gameId);
  }

  await deletePrivateRoom(room.id, room.gameId);
  const leftovers = await prisma.turboRoomSettings.count({
    where: { roomId: room.id },
  });
  const orphans = await prisma.turboMatch.count({
    where: { roomKey: room.id },
  });
  const seats = saved
    ? await prisma.turboMatchSeat.count({ where: { matchId: saved.id } })
    : 0;
  check("настройки ушли вместе с комнатой", leftovers === 0);
  check("партии ушли вместе с комнатой", orphans === 0);
  check("места ушли вместе с партиями", seats === 0);

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

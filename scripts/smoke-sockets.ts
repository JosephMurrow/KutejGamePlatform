import { io, type Socket } from "socket.io-client";
import { signSessionToken } from "../src/lib/auth/token";
import { prisma } from "../src/lib/prisma";
import {
  CLIENT_EVENT,
  KEY_QUERY,
  ROOM_QUERY,
  SCREEN_VIEW,
  SERVER_EVENT,
  VIEW_QUERY,
  type Ack,
  type ChatMessagePayload,
  type RoomStatePayload,
} from "../src/shared/protocol";
import { createPrivateRoom, deletePrivateRoom } from "../src/lib/rooms/private";
import { createGuest } from "../src/lib/auth/guest";

const URL = "http://localhost:3000";

let failures = 0;
function check(label: string, condition: boolean, extra = "") {
  const mark = condition ? "✓" : "✗";
  if (!condition) failures += 1;
  console.log(`  ${mark} ${label}${extra ? ` — ${extra}` : ""}`);
}

class Client {
  readonly states: RoomStatePayload[] = [];
  readonly chat: ChatMessagePayload[] = [];
  /** Причина, по которой сервер выставил из комнаты. */
  kicked: string | null = null;
  private socket!: Socket;

  constructor(readonly name: string) {}

  async connect(
    token: string | null,
    query?: Record<string, string>,
  ): Promise<void> {
    this.socket = io(URL, {
      transports: ["websocket"],
      extraHeaders: token === null ? {} : { Cookie: `pt_session=${token}` },
      query,
      forceNew: true,
    });

    this.socket.on(SERVER_EVENT.state, (state: RoomStatePayload) => {
      this.states.push(state);
    });
    this.socket.on(SERVER_EVENT.chatMessage, (message: ChatMessagePayload) => {
      this.chat.push(message);
    });
    this.socket.on(SERVER_EVENT.kicked, (payload: { reason?: string }) => {
      this.kicked = payload?.reason ?? "без причины";
    });

    await new Promise<void>((resolve, reject) => {
      this.socket.once("connect", () => resolve());
      this.socket.once("connect_error", (error: Error) => reject(error));
      setTimeout(() => reject(new Error("таймаут подключения")), 5000);
    });
  }

  get last(): RoomStatePayload | undefined {
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

  /** Дождаться состояния, удовлетворяющего условию. */
  async waitState(
    predicate: (state: RoomStatePayload) => boolean,
    label: string,
  ): Promise<RoomStatePayload> {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const found = this.states.findLast(predicate);
      if (found) return found;
      await sleep(50);
    }
    throw new Error(`${this.name}: не дождался состояния «${label}»`);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureUser(login: string, nickname: string, avatarId: number) {
  return prisma.user.upsert({
    where: { login },
    create: { login, passwordHash: "x", nickname, avatarId },
    update: { nickname, avatarId },
    select: { id: true, nickname: true },
  });
}

async function main() {
  const anya = await ensureUser("socket_anya", "Аня", 0);
  const borya = await ensureUser("socket_borya", "Боря", 5);

  const tokenA = await signSessionToken(anya.id, 3600);
  const tokenB = await signSessionToken(borya.id, 3600);

  console.log("\n[1] Подключение и ожидание второго игрока");
  const a = new Client("Аня");
  await a.connect(tokenA);
  const solo = await a.waitState((s) => s.phase === "waiting", "ожидание");
  check("одна вкладка — комната на паузе", solo.phase === "waiting");
  check(
    "названа причина паузы",
    solo.pauseReason === "not_enough_players",
    String(solo.pauseReason),
  );

  const b = new Client("Боря");
  await b.connect(tokenB);
  const started = await a.waitState(
    (s) => s.phase === "ready",
    "раунд начался",
  );
  check("второй игрок запустил раунд", started.phase === "ready");
  check("ведущий — тот, кто зашёл первым", started.hostId === anya.id);
  check(
    "дедлайн пришёл абсолютным временем",
    typeof started.deadline === "number",
  );
  check(
    "сервер прислал своё время для отсчёта",
    Math.abs(started.serverTime - Date.now()) < 5000,
  );

  console.log("\n[2] Вопрос в фазе READY виден только ведущему");
  const hostView = await a.waitState((s) => s.phase === "ready", "ready у Ани");
  const guestView = await b.waitState(
    (s) => s.phase === "ready",
    "ready у Бори",
  );
  check("ведущий видит вопрос", typeof hostView.question === "string");
  check("остальные вопроса не видят", guestView.question === null);
  console.log(`      вопрос: ${hostView.question}`);

  console.log("\n[3] Чужие действия и права");
  const wrongRead = await b.emit(CLIENT_EVENT.read);
  check("не ведущему нажать «Прочитал» нельзя", !wrongRead.ok, wrongRead.error);

  const read = await a.emit(CLIENT_EVENT.read);
  check("ведущий подтвердил, что прочитал", read.ok);
  const opened = await b.waitState(
    (s) => s.phase === "host_answer",
    "вопрос открыт",
  );
  check(
    "после «Прочитал» вопрос открыт всем",
    typeof opened.question === "string",
  );

  console.log("\n[4] Ответ ведущего скрыт до вскрышки");
  const badBet = await a.emit(CLIENT_EVENT.answer, { bet: 10_000_000_000 });
  check("сумма сверх потолка отклонена", !badBet.ok, badBet.error);

  const answer = await a.emit(CLIENT_EVENT.answer, { bet: 100_000 });
  check("ведущий назвал сумму", answer.ok);

  const betting = await b.waitState(
    (s) => s.phase === "betting",
    "ставки открыты",
  );
  check("ответ ведущего не утёк в состояние", betting.reveal === null);
  check(
    "в сыром состоянии нет суммы ведущего",
    !JSON.stringify(betting).includes("100000"),
  );

  console.log("\n[5] Ставки");
  const hostBet = await a.emit(CLIENT_EVENT.bet, { bet: 50_000 });
  check("ведущий ставить не может", !hostBet.ok, hostBet.error);

  // Полуторный промах: очко даётся, если ошибиться не больше чем вдвое.
  const bet = await b.emit(CLIENT_EVENT.bet, { bet: 150_000 });
  check("игрок поставил", bet.ok);

  const repeat = await b.emit(CLIENT_EVENT.bet, { bet: 1000 });
  check("ставку не поменять", !repeat.ok, repeat.error);

  console.log("\n[6] Вскрышка");
  const reveal = await b.waitState((s) => s.phase === "reveal", "вскрышка");
  check("фаза сменилась досрочно, все поставили", reveal.phase === "reveal");
  check("ответ ведущего раскрыт", reveal.reveal?.hostAnswer === 100_000);
  check("победитель определён", reveal.reveal?.bets[0]?.won === true);
  check(
    "очко засчитано",
    reveal.players.find((p) => p.id === borya.id)?.score === 1,
  );
  check(
    "ведущий без очков",
    reveal.players.find((p) => p.id === anya.id)?.score === 0,
  );

  console.log("\n[7] Чат и лимиты");
  const chat = await a.emit(CLIENT_EVENT.chat, { text: "всем привет" });
  check("сообщение принято", chat.ok);
  await sleep(200);
  check("собеседник его получил", b.chat.at(-1)?.text === "всем привет");

  const empty = await a.emit(CLIENT_EVENT.chat, { text: "   " });
  check("пустое сообщение отклонено", !empty.ok, empty.error);

  const long = await a.emit(CLIENT_EVENT.chat, { text: "я".repeat(301) });
  check("слишком длинное отклонено", !long.ok, long.error);

  let throttled = 0;
  for (let i = 0; i < 8; i++) {
    const result = await a.emit(CLIENT_EVENT.chat, { text: `спам ${i}` });
    if (!result.ok) throttled += 1;
  }
  check("частый спам придушен", throttled > 0, `отклонено ${throttled} из 8`);

  console.log("\n[8] Реконнект");
  b.disconnect();
  await sleep(300);
  const b2 = new Client("Боря снова");
  await b2.connect(tokenB);
  const restored = await b2.waitState((s) => s.players.length >= 1, "снимок");
  check("после реконнекта пришёл полный снимок", restored.players.length >= 1);
  check(
    "очки на месте",
    restored.players.find((p) => p.id === borya.id)?.score === 1,
  );
  console.log(
    `      фаза после реконнекта: ${restored.phase}, игроков: ${restored.players.length}`,
  );

  console.log("\n[9] Неаутентифицированный клиент");
  const stranger = io(URL, { transports: ["websocket"], forceNew: true });
  const rejected = await new Promise<boolean>((resolve) => {
    stranger.once("connect", () => resolve(false));
    stranger.once("connect_error", () => resolve(true));
    setTimeout(() => resolve(false), 3000);
  });
  stranger.close();
  check("без сессии не пускают", rejected);

  console.log("\n[10] Вид «экран»");
  const room = await createPrivateRoom(anya.id, {
    bettingMs: 60_000,
    revealMs: 10_000,
    includeAdult: true,
    mode: "normal",
    endMode: "endless",
    endValue: null,
    kind: "stream",
    title: "Смоук",
    // Смоук проверяет круг ходов, поэтому здесь он обычный.
    hostRotation: "circle",
    locked: false,
    maxPlayers: null,
    twitchChannel: null,
  });
  const roomQuery = { [ROOM_QUERY]: room.code };

  const host = new Client("Хозяин");
  await host.connect(tokenA, roomQuery);
  const guest = new Client("Гость");
  await guest.connect(tokenB, roomQuery);

  // Ключ у экрана есть, а сессии нет — ровно так ходит браузерный источник OBS.
  const screen = new Client("Экран");
  await screen.connect(null, {
    ...roomQuery,
    [VIEW_QUERY]: SCREEN_VIEW,
    [KEY_QUERY]: room.screenKey,
  });

  const onScreen = await screen.waitState((state) => state.isScreen, "снимок");
  check("экран пускают по ключу без сессии", onScreen.isScreen);
  check('у экрана нет своего "я"', onScreen.youId === "");
  check("название комнаты доехало", onScreen.roomTitle === "Смоук");

  const ready = await host.waitState(
    (state) => state.phase === "ready",
    "ready",
  );
  check(
    "ведущий видит вопрос",
    typeof ready.question === "string",
    `ведёт ${ready.hostId === anya.id ? "Аня" : String(ready.hostId)}, вопрос ${String(ready.question)}`,
  );

  const screenReady = await screen.waitState(
    (state) => state.phase === "ready",
    "ready на экране",
  );
  check("на экране вопроса нет", screenReady.question === null);
  check(
    "экран за стол не сел",
    screenReady.players.every((player) => player.id !== ""),
    `игроков ${screenReady.players.length}`,
  );
  check(
    "в составе ровно двое живых",
    screenReady.players.length === 2,
    `игроков ${screenReady.players.length}`,
  );

  await host.emit(CLIENT_EVENT.chat, { text: "экрану это видеть незачем" });
  await sleep(300);
  check("чат до экрана не доходит", screen.chat.length === 0);

  const badKey = new Client("Экран с чужим ключом");
  await badKey.connect(null, {
    ...roomQuery,
    [VIEW_QUERY]: SCREEN_VIEW,
    [KEY_QUERY]: "deadbeef",
  });
  await sleep(400);
  check("чужой ключ не пускают", badKey.kicked !== null, badKey.kicked ?? "");

  const noKey = new Client("Экран без ключа");
  await noKey.connect(null, { ...roomQuery, [VIEW_QUERY]: SCREEN_VIEW });
  await sleep(400);
  check("без ключа не пускают", noKey.kicked !== null, noKey.kicked ?? "");

  const globalScreen = new Client("Экран общего зала");
  await globalScreen.connect(null, {
    [VIEW_QUERY]: SCREEN_VIEW,
    [KEY_QUERY]: room.screenKey,
  });
  await sleep(400);
  check(
    "у общего зала экрана нет",
    globalScreen.kicked !== null,
    globalScreen.kicked ?? "",
  );

  console.log("\n[11] Гость");
  const made = await createGuest(room.id, "Зритель");
  check("гостя завели", made.ok, made.ok ? "" : made.reason);
  if (!made.ok) throw new Error(made.reason);

  const twice = await createGuest(room.id, "зритель");
  check(
    "занятый ник не выдаётся дважды",
    !twice.ok,
    twice.ok ? "" : twice.reason,
  );

  const rude = await createGuest(room.id, "хуйлушка");
  check("похабный ник отбивается", !rude.ok, rude.ok ? "" : rude.reason);

  const guestToken = await signSessionToken(made.guest.id, 3600, true);

  const viewer = new Client("Зритель");
  await viewer.connect(guestToken, roomQuery);
  const seated = await viewer.waitState(
    (state) => state.players.some((player) => player.id === made.guest.id),
    "гость за столом",
  );
  check("гость сел за стол своей комнаты", seated.players.length === 3);

  const wanderer = new Client("Гость в чужом зале");
  await wanderer.connect(guestToken);
  await sleep(500);
  check(
    "в общий зал гостя не пускают",
    wanderer.kicked !== null,
    wanderer.kicked ?? "",
  );

  console.log("\n[12] Замок набора");
  const closed = await host.emit(CLIENT_EVENT.lock, { locked: true });
  check("хозяин закрыл набор", closed.ok, closed.error);

  const notOwner = await guest.emit(CLIENT_EVENT.lock, { locked: false });
  check("чужой замок не трогает", !notOwner.ok, notOwner.error);

  const second = await createGuest(room.id, "Опоздавший");
  if (!second.ok) throw new Error(second.reason);
  const secondToken = await signSessionToken(second.guest.id, 3600, true);

  const late = new Client("Опоздавший");
  await late.connect(secondToken, roomQuery);
  await sleep(500);
  check(
    "в закрытую комнату не пускают",
    late.kicked !== null,
    late.kicked ?? "",
  );

  const back = new Client("Гость возвращается");
  await back.connect(guestToken, roomQuery);
  await sleep(500);
  check(
    "уже сидевшего замок не выкидывает",
    back.kicked === null,
    back.kicked ?? "",
  );

  await host.emit(CLIENT_EVENT.lock, { locked: false });
  late.disconnect();
  back.disconnect();

  viewer.disconnect();
  wanderer.disconnect();
  await sleep(200);

  host.disconnect();
  guest.disconnect();
  screen.disconnect();
  badKey.disconnect();
  noKey.disconnect();
  globalScreen.disconnect();
  await sleep(200);
  await deletePrivateRoom(room.id);
  await prisma.round.deleteMany({ where: { roomKey: room.id } });

  const leftovers = await prisma.user.count({
    where: { guestRoomId: room.id },
  });
  check(
    "гости ушли вместе с комнатой",
    leftovers === 0,
    `осталось ${leftovers}`,
  );

  a.disconnect();
  b2.disconnect();
  await sleep(200);

  await prisma.round.deleteMany({ where: { roomKey: "global" } });
  await prisma.score.deleteMany({ where: { roomKey: "global" } });
  await prisma.user.deleteMany({
    where: { login: { in: ["socket_anya", "socket_borya"] } },
  });

  console.log(
    failures === 0
      ? "\nВсе проверки прошли\n"
      : `\nПровалено проверок: ${failures}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { io, type Socket } from "socket.io-client";
import { signSessionToken } from "../src/lib/auth/token";
import { prisma } from "../src/lib/prisma";
import {
  CLIENT_EVENT,
  SERVER_EVENT,
  SOCKET_PATH,
  type RoomStatePayload,
} from "../src/shared/protocol";

/**
 * Наплыв игроков в общей комнате: проверяем, что круг ходов не разваливается,
 * рассылка доходит до всех и никто не выпадает из состава.
 *
 *   npm run smoke:crowd -- 12 3
 */
const URL = process.env.CROWD_URL ?? "http://localhost:3000";
const COUNT = Number(process.argv[2] ?? 12);
const ROUNDS = Number(process.argv[3] ?? 3);
const PREFIX = "crowd_";

let failures = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Bot {
  id: string;
  nickname: string;
  socket: Socket;
  states: RoomStatePayload[];
}

async function main() {
  console.log(`Поднимаем ${COUNT} игроков, смотрим ${ROUNDS} раунда(ов)\n`);

  const bots: Bot[] = [];
  for (let i = 0; i < COUNT; i++) {
    const login = `${PREFIX}${i}`;
    const nickname = `Толпа ${i}`;

    const user = await prisma.user.upsert({
      where: { login },
      create: { login, passwordHash: "x", nickname, avatarId: i % 30 },
      update: { nickname },
      select: { id: true },
    });

    const token = await signSessionToken(user.id, 3600);
    const socket = io(URL, {
      path: SOCKET_PATH,
      transports: ["websocket"],
      extraHeaders: { Cookie: `pt_session=${token}` },
      forceNew: true,
    });

    const bot: Bot = { id: user.id, nickname, socket, states: [] };
    bots.push(bot);

    socket.on(SERVER_EVENT.state, (state: RoomStatePayload) => {
      bot.states.push(state);
      void react(bot, state);
    });

    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("connect_error", reject);
      setTimeout(() => reject(new Error("таймаут подключения")), 5000);
    });
  }

  console.log("Все подключились, ждём раунды…\n");

  const hosts: string[] = [];
  const deadline = Date.now() + ROUNDS * 60_000;
  const watcher = bots[0];
  if (!watcher) throw new Error("некому наблюдать");

  while (hosts.length < ROUNDS && Date.now() < deadline) {
    const current = watcher.states.at(-1)?.hostId;
    if (current && hosts.at(-1) !== current) {
      hosts.push(current);
      console.log(`  раунд ${hosts.length}: ведёт ${nameOf(bots, current)}`);
    }
    await sleep(250);
  }

  const last = watcher.states.at(-1);

  console.log("\nСостав комнаты");
  // Считаем по playerCount, а не по длине списка: на большой комнате в снимок
  // едет верхушка таблицы, а не все подряд (см. docs/BACKLOG.md N4).
  check(
    "все игроки за столом",
    last?.playerCount === COUNT,
    `${last?.playerCount} из ${COUNT}`,
  );
  check(
    "дублей в присланном составе нет",
    new Set(last?.players.map((player) => player.id)).size ===
      last?.players.length,
  );
  check(
    "снимок не тащит весь зал",
    (last?.players.length ?? 0) <= Math.min(COUNT, 13),
    `в снимке ${last?.players.length} из ${COUNT}`,
  );
  check(
    "рассылка дошла до каждого",
    bots.every((bot) => bot.states.length > 0),
  );

  console.log("\nКруг ходов");
  check("раунды сменяются", hosts.length === ROUNDS, `сыграно ${hosts.length}`);
  check(
    "ведущие не повторяются",
    new Set(hosts).size === hosts.length,
    hosts.map((id) => nameOf(bots, id)).join(" → "),
  );

  console.log("\nУход половины состава");
  const leaving = bots.slice(0, Math.floor(COUNT / 2));
  for (const bot of leaving) bot.socket.disconnect();
  await sleep(17_000); // отсрочка выхода из-за стола плюс запас

  const after = bots.at(-1)?.states.at(-1);
  const expected = COUNT - leaving.length;
  check(
    "состав уменьшился ровно на ушедших",
    after?.playerCount === expected,
    `${after?.playerCount} из ${expected}`,
  );
  check("игра не встала", after?.phase !== "waiting", after?.phase);

  for (const bot of bots) bot.socket.close();
  await sleep(300);
  await cleanup();

  console.log(
    failures === 0 ? "\nВсе проверки прошли\n" : `\nПровалено: ${failures}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

async function react(bot: Bot, state: RoomStatePayload) {
  const isHost = state.hostId === bot.id;
  const you = state.players.find((player) => player.id === bot.id);

  if (isHost && state.phase === "ready") {
    bot.socket.emit(CLIENT_EVENT.read, {});
    return;
  }
  if (isHost && state.phase === "host_answer") {
    bot.socket.emit(CLIENT_EVENT.answer, { bet: 10_000 });
    return;
  }
  if (!isHost && state.phase === "betting" && you && !you.hasBet) {
    bot.socket.emit(CLIENT_EVENT.bet, {
      bet: 1000 + Math.floor(Math.random() * 90_000),
    });
  }
}

function nameOf(bots: Bot[], id: string): string {
  return bots.find((bot) => bot.id === id)?.nickname ?? id.slice(0, 6);
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { login: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  if (ids.length === 0) return;

  await prisma.round.deleteMany({ where: { hostId: { in: ids } } });
  await prisma.score.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

main().catch(async (error) => {
  console.error(error);
  await cleanup();
  process.exit(1);
});

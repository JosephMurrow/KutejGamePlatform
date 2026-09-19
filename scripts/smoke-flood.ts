import { io, type Socket } from "socket.io-client";
import { signSessionToken } from "../src/lib/auth/token";
import { prisma } from "../src/lib/prisma";
import { createPrivateRoom, deletePrivateRoom } from "../src/lib/rooms/private";
import {
  CLIENT_EVENT,
  ROOM_QUERY,
  SERVER_EVENT,
  SOCKET_PATH,
  type Ack,
} from "../src/shared/protocol";
import { SMOKE_URL } from "./actions";

/**
 * Смоук: лимиты сокетов (docs/SECURITY.md, S-E1, S-E2).
 *
 * Подключения с одного адреса, открытые вкладки игрока, управление комнатой,
 * общий потолок на любое событие и размер сообщения. Разные клиенты
 * изображаются `X-Forwarded-For`, как в остальных смоуках безопасности.
 *
 * Запуск: npm run smoke:flood
 */

const run = Date.now().toString(36);
const ip = (block: number, n = 1) =>
  `10.${block}.${parseInt(run.slice(-2), 36) % 250}.${n}`;

let failures = 0;

function check(label: string, condition: boolean, extra = "") {
  if (condition) {
    console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ""}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Attempt {
  socket: Socket;
  /** Сообщение отказа на рукопожатии или `null`, если пустили. */
  refused: string | null;
}

/** Подключиться и дождаться: пустили (пришло состояние) или отказали. */
function connect(
  address: string,
  options: { token?: string; room?: string } = {},
): Promise<Attempt> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = { "X-Forwarded-For": address };
    if (options.token) headers.Cookie = `pt_session=${options.token}`;

    const socket = io(SMOKE_URL, {
      path: SOCKET_PATH,
      transports: ["websocket"],
      extraHeaders: headers,
      query: options.room ? { [ROOM_QUERY]: options.room } : {},
      forceNew: true,
      reconnection: false,
    });

    let settled = false;
    const done = (refused: string | null) => {
      if (settled) return;
      settled = true;
      resolve({ socket, refused });
    };
    socket.on("connect_error", (error) => done(error.message));
    socket.on(SERVER_EVENT.state, () => done(null));
    socket.on(SERVER_EVENT.kicked, (payload: { reason: string }) =>
      done(`kicked: ${payload.reason}`),
    );
    setTimeout(() => done("тишина"), 5000);
  });
}

function emit(socket: Socket, event: string, payload?: unknown): Promise<Ack> {
  return new Promise((resolve) => {
    socket.emit(event, payload ?? {}, (ack: Ack) => resolve(ack));
    setTimeout(() => resolve({ ok: false, error: "нет ответа" }), 3000);
  });
}

async function main() {
  console.log(`Смоук сокетов: ${SMOKE_URL}, прогон ${run}\n`);

  const owner = await prisma.user.create({
    data: {
      login: `flood_${run}`,
      passwordHash: "x",
      nickname: "Хозяин потопа",
      avatarId: 1,
    },
    select: { id: true },
  });
  const room = await createPrivateRoom(owner.id, {
    kind: "private",
    title: null,
    locked: false,
    maxPlayers: null,
    twitchChannel: null,
  });
  const token = await signSessionToken(owner.id, 3600);
  const open: Socket[] = [];

  try {
    console.log("[1] Подключения с одного адреса");
    const flood = ip(1);
    let refusedEarly = 0;
    for (let n = 0; n < 120; n++) {
      const attempt = await connect(flood);
      attempt.socket.disconnect();
      if (attempt.refused?.includes("Слишком много подключений"))
        refusedEarly++;
    }
    check("сто двадцать проходят до проверки сессии", refusedEarly === 0);
    const extra = await connect(flood);
    extra.socket.disconnect();
    check(
      "сто двадцать первое — отказ до базы",
      extra.refused?.includes("Слишком много подключений") === true,
      String(extra.refused),
    );
    const neighbour = await connect(ip(1, 2));
    neighbour.socket.disconnect();
    check(
      "соседний адрес не задет",
      neighbour.refused?.includes("Слишком много подключений") === false,
      String(neighbour.refused),
    );

    console.log("\n[2] Открытые вкладки игрока");
    for (let n = 0; n < 10; n++) {
      const tab = await connect(ip(2), { token, room: room.code });
      open.push(tab.socket);
      if (tab.refused !== null) check(`вкладка ${n + 1}`, false, tab.refused);
    }
    const eleventh = await connect(ip(2), { token, room: room.code });
    eleventh.socket.disconnect();
    check(
      "одиннадцатая — отказ",
      eleventh.refused?.includes("вкладок") === true,
      String(eleventh.refused),
    );
    open.pop()?.disconnect();
    await sleep(300);
    const again = await connect(ip(2), { token, room: room.code });
    open.push(again.socket);
    check("закрыл одну — новая открылась", again.refused === null);

    console.log("\n[3] Управление комнатой: замок");
    const owner0 = open[0] as Socket;
    const locks = await Promise.all(
      Array.from({ length: 20 }, (_, n) =>
        emit(owner0, CLIENT_EVENT.lock, { locked: n % 2 === 0 }),
      ),
    );
    const accepted = locks.filter((ack) => ack.ok).length;
    check(
      "из двадцати щелчков прошло не больше десяти",
      accepted <= 10,
      `${accepted}`,
    );
    check(
      "остальным — «слишком часто»",
      locks.some((ack) => ack.error?.includes("Слишком часто")),
    );

    console.log("\n[4] Общий потолок на любое событие");
    const other = open[1] as Socket;
    const pings = await Promise.all(
      Array.from({ length: 60 }, () => emit(other, "no:such:event")),
    );
    const cut = pings.filter((ack) => ack.error?.includes("Слишком часто"));
    check(
      "даже неизвестное событие упирается в потолок",
      cut.length >= 10,
      `отказов ${cut.length}`,
    );

    console.log("\n[5] Размер сообщения");
    const big = open[2] as Socket;
    const closed = new Promise<boolean>((resolve) => {
      big.on("disconnect", () => resolve(true));
      setTimeout(() => resolve(false), 3000);
    });
    big.emit(CLIENT_EVENT.chat, { text: "а".repeat(40 * 1024) });
    check("сообщение больше 32 КБ рвёт соединение", await closed);
  } finally {
    for (const socket of open) socket.disconnect();
    await sleep(300);
    await deletePrivateRoom(room.id, room.gameId);
    await prisma.user.deleteMany({ where: { id: owner.id } });
  }

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

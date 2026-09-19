import { io } from "socket.io-client";
import { prisma } from "../src/lib/prisma";
import {
  createPrivateRoom,
  deletePrivateRoom,
  markOrphanRooms,
  MAX_ROOMS_PER_HOST,
} from "../src/lib/rooms/private";
import { signSessionToken } from "../src/lib/auth/token";
import {
  KEY_QUERY,
  ROOM_QUERY,
  SCREEN_VIEW,
  SERVER_EVENT,
  SOCKET_PATH,
  VIEW_QUERY,
} from "../src/shared/protocol";
import { callAction, form, SMOKE_URL } from "./actions";

/**
 * Смоук: коды комнат и квота (docs/SECURITY.md, S-D1, S-D2).
 *
 * S-D1 — промахи по коду считаются на адрес, общим счётчиком для всех
 * дверей: экшен входа по коду, сокет (в том числе экран без сессии) и
 * страница комнаты. Разные клиенты изображаются `X-Forwarded-For`.
 * S-D2 — у новой комнаты сразу идёт отсчёт до удаления, у хозяина потолок
 * комнат, а уборщик проставляет отсчёт комнатам без людей и без отметки.
 *
 * Нужна прод-сборка. Запуск: npm run smoke:rooms
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

/** Код правильной формы, которого точно нет: у живых кодов нет повторов в хвосте. */
const missCode = (n: number) =>
  `ZZ${"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32]}${"ABCDEFGH"[n % 8]}QQ`;

/** Подключиться сокетом-экраном и узнать, чем кончилось. */
function screenAttempt(
  code: string,
  key: string,
  address: string,
): Promise<{ kicked: string | null; state: boolean }> {
  return new Promise((resolve) => {
    const socket = io(SMOKE_URL, {
      path: SOCKET_PATH,
      transports: ["websocket"],
      extraHeaders: { "X-Forwarded-For": address },
      query: {
        [ROOM_QUERY]: code,
        [VIEW_QUERY]: SCREEN_VIEW,
        [KEY_QUERY]: key,
      },
      forceNew: true,
      reconnection: false,
    });
    const done = (result: { kicked: string | null; state: boolean }) => {
      socket.disconnect();
      resolve(result);
    };
    socket.on(SERVER_EVENT.kicked, (payload: { reason: string }) =>
      done({ kicked: payload.reason, state: false }),
    );
    socket.on(SERVER_EVENT.state, () => done({ kicked: null, state: true }));
    setTimeout(() => done({ kicked: null, state: false }), 4000);
  });
}

async function page(path: string, address: string): Promise<number> {
  const res = await fetch(`${SMOKE_URL}${path}`, {
    headers: { "X-Forwarded-For": address },
    redirect: "manual",
  });
  return res.status;
}

async function main() {
  console.log(`Смоук комнат: ${SMOKE_URL}, прогон ${run}\n`);

  const host = await prisma.user.create({
    data: {
      login: `rooms_${run}`,
      passwordHash: "x",
      nickname: "Хозяин кодов",
      avatarId: 1,
    },
    select: { id: true },
  });
  const room = await createPrivateRoom(host.id, {
    kind: "stream",
    title: "Смоук кодов",
    locked: false,
    maxPlayers: null,
    twitchChannel: null,
  });

  try {
    console.log("[1] Вход по коду: промахи копятся на адрес");
    const joinByCode = (code: string, address: string) =>
      callAction("joinByCodeAction", [{}, form({ code })], { address });

    for (let n = 0; n < 20; n++) {
      const reply = await joinByCode(missCode(n), ip(1));
      if (!reply.body.includes("Такой комнаты нет")) {
        check(
          `промах ${n + 1} — «нет комнаты»`,
          false,
          reply.body.slice(0, 80),
        );
      }
    }
    const late = await joinByCode(room.code, ip(1));
    check(
      "21-й раз — отказ даже с верным кодом",
      late.redirect === null && late.body.includes("Слишком много неверных"),
    );
    const other = await joinByCode(room.code, ip(1, 2));
    check(
      "с другого адреса верный код пускает",
      other.redirect?.startsWith(`/r/${room.code}`) === true,
      other.redirect ?? "без редиректа",
    );

    console.log("\n[2] Сокет-экран без сессии: тот же счётчик");
    for (let n = 0; n < 20; n++) {
      const result = await screenAttempt(missCode(n), "x", ip(2));
      if (result.kicked !== "Комната не найдена") {
        check(`промах ${n + 1} — «не найдена»`, false, String(result.kicked));
      }
    }
    const blocked = await screenAttempt(room.code, room.screenKey, ip(2));
    check(
      "21-й раз — отказ даже с кодом и ключом",
      blocked.kicked?.includes("Слишком много неверных") === true,
      String(blocked.kicked),
    );
    const fresh = await screenAttempt(room.code, room.screenKey, ip(2, 2));
    check("с другого адреса экран открывается", fresh.state);

    console.log("\n[3] Страница комнаты: тот же счётчик");
    for (let n = 0; n < 20; n++) {
      const status = await page(`/r/${missCode(n)}`, ip(3));
      if (status !== 404) check(`промах ${n + 1} — 404`, false, `${status}`);
    }
    check(
      "21-й раз — и живая комната «не найдена»",
      (await page(`/r/${room.code}`, ip(3))) === 404,
    );
    check(
      "с другого адреса живая комната открывается",
      (await page(`/r/${room.code}`, ip(3, 2))) === 200,
    );

    console.log("\n[4] Счётчик общий: промахи на странице закрывают и экшен");
    for (let n = 0; n < 20; n++) await page(`/r/${missCode(n)}`, ip(4));
    const crossed = await joinByCode(room.code, ip(4));
    check("экшен отказывает", crossed.body.includes("Слишком много неверных"));
    // Сокет-сервер грузит исходники сам, Next — своим бандлом: счётчик общий
    // только потому, что лежит в globalThis. Это и проверяем.
    const socketToo = await screenAttempt(room.code, room.screenKey, ip(4));
    check(
      "и сокет отказывает — счётчик один на процесс",
      socketToo.kicked?.includes("Слишком много неверных") === true,
      String(socketToo.kicked),
    );
    for (let n = 0; n < 20; n++) {
      await screenAttempt(missCode(n), "x", ip(4, 3));
    }
    const back = await joinByCode(room.code, ip(4, 3));
    check(
      "промахи сокета закрывают экшен",
      back.body.includes("Слишком много неверных"),
    );

    console.log("\n[5] Новая комната: отсчёт идёт с рождения");
    const token = await signSessionToken(host.id, 3600);
    const create = () =>
      callAction(
        "createRoomAction",
        [{}, form({ kind: "private", game: "pricetitute" })],
        { token },
      );
    const first = await create();
    const code = first.redirect?.match(/\/r\/([A-Z0-9]{6})/)?.[1];
    const made = code
      ? await prisma.privateRoom.findUnique({
          where: { code },
          select: { emptySince: true },
        })
      : null;
    check("комната заведена", !!made, first.redirect ?? "без редиректа");
    check("отсчёт уже идёт", made?.emptySince instanceof Date);

    console.log("\n[6] Квота комнат у хозяина");
    // Одна — из раздела [5], одна — стримерская для кодов.
    for (let n = 2; n < MAX_ROOMS_PER_HOST; n++) await create();
    const total = await prisma.privateRoom.count({
      where: { hostId: host.id },
    });
    check(
      `комнат ровно ${MAX_ROOMS_PER_HOST}`,
      total === MAX_ROOMS_PER_HOST,
      `${total}`,
    );
    const over = await create();
    check(
      "следующая — отказ",
      over.redirect === null && over.body.includes("комнат"),
    );
    check(
      "и новой строки нет",
      (await prisma.privateRoom.count({ where: { hostId: host.id } })) ===
        MAX_ROOMS_PER_HOST,
    );

    console.log("\n[7] Уборщик: отсчёт комнатам без людей и без отметки");
    await prisma.privateRoom.updateMany({
      where: { hostId: host.id },
      data: { emptySince: null },
    });
    const live = [room.id];
    // Только свои комнаты: база общая с чужим dev-сервером, трогать его
    // комнаты смоук не вправе.
    await markOrphanRooms(live, new Date(), host.id);
    const rest = await prisma.privateRoom.findMany({
      where: { hostId: host.id },
      select: { id: true, emptySince: true },
    });
    check(
      "у ничьих комнат отсчёт пошёл",
      rest
        .filter((r) => r.id !== room.id)
        .every((r) => r.emptySince instanceof Date),
    );
    check(
      "поднятую в памяти не тронул",
      rest.find((r) => r.id === room.id)?.emptySince === null,
    );
  } finally {
    const rooms = await prisma.privateRoom.findMany({
      where: { hostId: host.id },
      select: { id: true, gameId: true },
    });
    for (const r of rooms) await deletePrivateRoom(r.id, r.gameId);
    await prisma.user.deleteMany({ where: { id: host.id } });
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

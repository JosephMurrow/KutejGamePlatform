import { createRequire } from "node:module";
import { createGuest } from "../src/lib/auth/guest";
import { issueLink } from "../src/lib/auth/links";
import { signSessionToken } from "../src/lib/auth/token";
import { prisma } from "../src/lib/prisma";
import { createPrivateRoom, deletePrivateRoom } from "../src/lib/rooms/private";

/**
 * Смоук: серверные экшены глазами гостя (docs/SECURITY.md, S-C1).
 *
 * Гостю proxy.ts закрывает страницы, но экшен зовётся не со страницы, а
 * POST-запросом с заголовком `Next-Action` — на любой адрес сайта. Поэтому
 * проверяем так, как это сделал бы посторонний: берём идентификаторы экшенов
 * из манифеста сборки, кодируем аргументы тем же `encodeReply`, что и браузер,
 * и шлём с гостевой сессией на `/`.
 *
 * Каждому отказу гостя поставлен контроль: тот же приём от полноценного
 * игрока проходит. Иначе сломанный вызов — не тот идентификатор, не та
 * кодировка — выглядел бы как успешный отказ.
 *
 * Сверяется результат — что в базе ничего не поменялось, — а не то, кто именно
 * отказал. Защиты две, и снаружи их не различить: Next пересылает экшен на
 * страницу, где он объявлен (профиль — на `/profile`), и там гостя
 * разворачивает proxy.ts; а за ним стоит проверка в самом экшене. Первая
 * держится на том, где лежат формы, и исчезнет, как только форму вставят на
 * открытую гостю страницу. Вторая — нет. У сброса пароля первой защиты нет
 * вовсе: `/forgot` и `/reset` гостю открыты.
 *
 * Нужна прод-сборка (`npm run build`): манифест берётся из `.next`.
 *
 * Запуск: npm run smoke:guest
 */

const URL = process.env.SMOKE_URL ?? "http://localhost:3000";
const HOST_LOGIN = "smoke_ga_host";

const require = createRequire(import.meta.url);

type Encoded = string | FormData | URLSearchParams;
const { encodeReply } =
  require("next/dist/compiled/react-server-dom-webpack/client.node.js") as {
    encodeReply: (value: unknown) => Promise<Encoded>;
  };

interface ActionEntry {
  exportedName?: string;
}
const manifest = require(
  `${process.cwd()}/.next/server/server-reference-manifest.json`,
) as {
  node: Record<string, ActionEntry>;
};

let failures = 0;

function check(label: string, condition: boolean, extra = "") {
  if (condition) {
    console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ""}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

function actionId(name: string): string {
  const found = Object.entries(manifest.node).find(
    ([, entry]) => entry.exportedName === name,
  );
  if (!found) throw new Error(`Экшена ${name} нет в манифесте — собери заново`);
  return found[0];
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

interface ActionReply {
  status: number;
  /** Куда экшен отправил редиректом, если отправил. */
  redirect: string | null;
  /** Тело ответа RSC как текст: сверяем по подстроке. */
  body: string;
}

/** Позвать экшен так, как его зовёт браузер. */
async function callAction(
  name: string,
  args: unknown[],
  token: string,
  /** С какой страницы звать. Посторонний выберет любую, по умолчанию `/`. */
  path = "/",
): Promise<ActionReply> {
  const res = await fetch(`${URL}${path}`, {
    method: "POST",
    headers: {
      "Next-Action": actionId(name),
      Origin: URL,
      Accept: "text/x-component",
      Cookie: `pt_session=${token}`,
    },
    body: await encodeReply(args),
    redirect: "manual",
  });

  return {
    status: res.status,
    redirect: res.headers.get("x-action-redirect"),
    body: await res.text(),
  };
}

async function main() {
  console.log(`Смоук экшенов гостя: ${URL}\n`);

  const host = await prisma.user.upsert({
    where: { login: HOST_LOGIN },
    create: {
      login: HOST_LOGIN,
      passwordHash: "x",
      nickname: "Хозяин смоука",
      avatarId: 1,
    },
    update: { nickname: "Хозяин смоука", avatarId: 1 },
    select: { id: true },
  });
  const hostToken = await signSessionToken(host.id, 3600);

  const room = await createPrivateRoom(host.id, {
    kind: "stream",
    title: "Смоук гостя",
    locked: false,
    maxPlayers: null,
    twitchChannel: null,
  });

  const made = await createGuest(room.id, "Проверяльщик");
  if (!made.ok) throw new Error(`гость не завёлся: ${made.reason}`);
  const guest = made.guest;
  const guestToken = await signSessionToken(guest.id, 3600, true);

  try {
    console.log("[1] Контроль: вызов экшена работает");
    const hostProfile = await callAction(
      "updateProfileAction",
      [{}, form({ nickname: "Хозяин проверен", avatarId: "2" })],
      hostToken,
    );
    const hostAfter = await prisma.user.findUnique({
      where: { id: host.id },
      select: { nickname: true },
    });
    check(
      "игрок меняет свой ник экшеном",
      hostAfter?.nickname === "Хозяин проверен",
      `ответ ${hostProfile.status}`,
    );

    console.log("\n[2] Профиль: гость не меняет ник мимо фильтра");
    const profile = await callAction(
      "updateProfileAction",
      [{}, form({ nickname: "Взломщик", avatarId: "3" })],
      guestToken,
    );
    const guestAfter = await prisma.user.findUnique({
      where: { id: guest.id },
      select: { nickname: true, avatarId: true, email: true },
    });
    check(
      "ник гостя прежний",
      guestAfter?.nickname === "Проверяльщик",
      `${guestAfter?.nickname}, ответ ${profile.status}`,
    );

    console.log("\n[3] Почта: гость её не привязывает");
    const email = await callAction(
      "attachEmailAction",
      [{}, form({ email: "guest-smoke@local.test" })],
      guestToken,
    );
    const guestMail = await prisma.user.findUnique({
      where: { id: guest.id },
      select: { email: true },
    });
    check(
      "почты у гостя нет",
      guestMail?.email === null,
      `ответ ${email.status}`,
    );

    console.log("\n[4] Комнаты: гость своих не заводит");
    const createAsGuest = await callAction(
      "createRoomAction",
      [{}, form({ kind: "private", game: "pricetitute" })],
      guestToken,
    );
    const guestRooms = await prisma.privateRoom.count({
      where: { hostId: guest.id },
    });
    check(
      "комнат у гостя нет",
      guestRooms === 0,
      `комнат ${guestRooms}, ответ ${createAsGuest.status}`,
    );

    console.log("\n[5] Рейтинг: читать гостю можно — из своей комнаты");
    // Рейтинг зовётся из окна поверх комнаты, поэтому и зовём с её адреса.
    const roomPath = `/r/${room.code}`;
    const board = await callAction(
      "fetchLeaderboard",
      ["all"],
      guestToken,
      roomPath,
    );
    check(
      "платитутка отдаёт таблицу",
      board.status === 200 && board.body.includes(guest.id),
      `ответ ${board.status}`,
    );
    const chessBoard = await callAction("fetchBoard", [], guestToken, roomPath);
    check(
      "шахматы отдают таблицу",
      chessBoard.status === 200 && chessBoard.body.includes(guest.id),
      `ответ ${chessBoard.status}`,
    );

    console.log("\n[6] Сброс пароля: гостю ссылку не выдают");
    // Хуже некуда: почта у гостя уже есть и подтверждена — как было бы, успей
    // он её привязать до этой правки.
    const login = (
      await prisma.user.update({
        where: { id: guest.id },
        data: {
          email: "guest-smoke@local.test",
          emailConfirmedAt: new Date(),
        },
        select: { login: true },
      })
    ).login;

    const reset = await callAction(
      "requestResetAction",
      [{}, form({ identity: login })],
      guestToken,
    );
    const links = await prisma.oneTimeLink.count({
      where: { userId: guest.id, purpose: "PASSWORD_RESET" },
    });
    check(
      "ответ тот же, что всем",
      reset.body.includes("Если такой аккаунт есть"),
    );
    check("ссылка не выдана", links === 0, `ссылок ${links}`);

    console.log("\n[7] Сброс пароля: чужая ссылка гостю пароль не даёт");
    const token = await issueLink(
      guest.id,
      "guest-smoke@local.test",
      "PASSWORD_RESET",
    );
    const setPassword = await callAction(
      "resetPasswordAction",
      [{}, form({ token, password: "smoke-password-1" })],
      guestToken,
    );
    const guestHash = await prisma.user.findUnique({
      where: { id: guest.id },
      select: { passwordHash: true },
    });
    check(
      "пароль не поставлен",
      guestHash?.passwordHash === "-",
      `ответ ${setPassword.status}`,
    );
    check(
      "отказ словами, а не редиректом в игру",
      setPassword.redirect === null &&
        setPassword.body.includes("Ссылка не сработала"),
    );
  } finally {
    await deletePrivateRoom(room.id, room.gameId);
    await prisma.privateRoom.deleteMany({ where: { hostId: host.id } });
    await prisma.user.deleteMany({ where: { login: HOST_LOGIN } });
  }

  const leftovers = await prisma.user.count({ where: { id: guest.id } });
  check("гость ушёл вместе с комнатой", leftovers === 0);

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

import { hash } from "@node-rs/argon2";
import { issueLink } from "../src/lib/auth/links";
import { signSessionToken } from "../src/lib/auth/token";
import { prisma } from "../src/lib/prisma";
import { callAction, form, SMOKE_URL } from "./actions";

/**
 * Смоук: аккаунт — почта, возврат после входа, пароль, сессии
 * (docs/SECURITY.md, S-B3, S-B4, S-B5, S-B6).
 *
 * S-B3 — почта меняется только с паролем, прежний подтверждённый адрес
 * получает письмо о смене, а форма почты не служит обходом лимита входа.
 * S-B4 — параметр `next` не уводит на чужой домен ни через экшен входа, ни
 * через `proxy.ts`. S-B5 — смена пароля и выход везде закрывают прежние
 * сессии, оставляя текущую. S-B6 — ссылку подтверждения гасит кнопка, а не
 * открытие страницы.
 *
 * Экшены зовутся как у постороннего (`./actions.ts`), письма считает
 * локальный mailpit. Нужна прод-сборка и mailpit. Запуск: npm run smoke:account
 */

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const run = Date.now().toString(36);
const ip = (n: number) => `10.77.${parseInt(run.slice(-2), 36) % 250}.${n}`;

let failures = 0;

function check(label: string, condition: boolean, extra = "") {
  if (condition) {
    console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ""}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

/** Сколько писем с такой темой mailpit принял на адрес. */
async function letters(to: string, subject?: string): Promise<number> {
  const query = subject ? `to:"${to}" subject:"${subject}"` : `to:"${to}"`;
  const res = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(query)}`,
  );
  return ((await res.json()) as { messages_count: number }).messages_count;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 500));

/** Код ответа профиля с этой сессией: 200 — пускает, редирект — нет. */
async function profile(session: string): Promise<number> {
  const res = await fetch(`${SMOKE_URL}/profile`, {
    headers: { Cookie: `pt_session=${session}` },
    redirect: "manual",
  });
  return res.status;
}

async function main() {
  console.log(`Смоук аккаунта: ${SMOKE_URL}, прогон ${run}\n`);

  const password = `pw-${run}-secret`;
  const oldMail = `old-${run}@local.test`;
  const newMail = `new-${run}@local.test`;

  const owner = await prisma.user.create({
    data: {
      login: `acc_${run}`,
      passwordHash: await hash(password),
      nickname: "Хозяин почты",
      avatarId: 1,
      email: oldMail,
      emailConfirmedAt: new Date(),
    },
    select: { id: true, login: true },
  });
  const walker = await prisma.user.create({
    data: {
      login: `nxt_${run}`,
      passwordHash: await hash(password),
      nickname: "Возвращенец",
      avatarId: 2,
    },
    select: { id: true, login: true },
  });

  const token = await signSessionToken(owner.id, 3600);
  const extra: string[] = [];
  const attach = (fields: Record<string, string>) =>
    callAction("attachEmailAction", [{}, form(fields)], { token });
  const emailNow = async () =>
    (
      await prisma.user.findUnique({
        where: { id: owner.id },
        select: { email: true, emailConfirmedAt: true },
      })
    )?.email;

  try {
    console.log("[1] Без пароля почту не сменить");
    const bare = await attach({ email: newMail });
    check("просит пароль", bare.body.includes("Введи текущий пароль"));
    check("адрес прежний", (await emailNow()) === oldMail);

    console.log("\n[2] С чужим паролем — тоже");
    const wrong = await attach({ email: newMail, password: "not-mine-at-all" });
    check("пароль не подходит", wrong.body.includes("Пароль не подходит"));
    check("адрес прежний", (await emailNow()) === oldMail);

    console.log("\n[3] С паролем — меняется, прежний адрес узнаёт");
    const right = await attach({ email: newMail, password });
    check("письмо ушло", right.body.includes("Письмо ушло"));
    const after = await prisma.user.findUnique({
      where: { id: owner.id },
      select: { email: true, emailConfirmedAt: true },
    });
    check("адрес новый", after?.email === newMail, after?.email ?? "");
    check("и не подтверждён", after?.emailConfirmedAt === null);
    await settle();
    check(
      "прежнему адресу — письмо о смене",
      (await letters(oldMail, "Почту аккаунта сменили")) === 1,
    );
    check(
      "новому — письмо с подтверждением",
      (await letters(newMail, "Подтверди адрес")) === 1,
    );

    console.log("\n[4] Повторное письмо на тот же адрес — без пароля");
    const again = await attach({ email: newMail });
    check("письмо ушло", again.body.includes("Письмо ушло"));

    console.log("\n[5] Форма почты — не обход лимита входа");
    for (let i = 0; i < 10; i++) {
      await callAction(
        "loginAction",
        [{}, form({ login: owner.login, password: "wrong" })],
        { address: ip(i) },
      );
    }
    const blocked = await attach({ email: oldMail, password });
    check(
      "после десяти неудач входа и верный пароль в форме почты не проходит",
      blocked.body.includes("Слишком много попыток"),
    );
    check("адрес прежний", (await emailNow()) === newMail);

    console.log("\n[6] Вход: `next` не уводит наружу");
    const loginWith = (next: string, n: number) =>
      callAction(
        "loginAction",
        [{}, form({ login: walker.login, password, next })],
        { address: ip(100 + n) },
      );
    const attempts = [
      "/\\evil.com",
      "//evil.com",
      "/\\/evil.com",
      "https://evil.com",
    ];
    for (const [n, next] of attempts.entries()) {
      const reply = await loginWith(next, n);
      check(
        `${JSON.stringify(next)} → на витрину`,
        reply.redirect?.startsWith("/games") === true,
        reply.redirect ?? "без редиректа",
      );
    }
    const inside = await loginWith("/r/ABC123?x=1", 9);
    check(
      "свой путь — как есть",
      reply(inside).startsWith("/r/ABC123?x=1"),
      reply(inside),
    );

    console.log("\n[7] proxy.ts: вошедший на /login с `next`");
    const walkerToken = await signSessionToken(walker.id, 3600);
    const viaProxy = async (next: string) => {
      const res = await fetch(
        `${SMOKE_URL}/login?next=${encodeURIComponent(next)}`,
        {
          headers: { Cookie: `pt_session=${walkerToken}` },
          redirect: "manual",
        },
      );
      return new URL(res.headers.get("location") ?? "", SMOKE_URL);
    };
    const origin = new URL(SMOKE_URL).origin;
    for (const next of attempts) {
      const target = await viaProxy(next);
      check(
        `${JSON.stringify(next)} → свой сайт`,
        target.origin === origin && target.pathname === "/games",
        target.href,
      );
    }
    const own = await viaProxy("/games/chess");
    check(
      "свой путь — как есть",
      own.origin === origin && own.pathname === "/games/chess",
      own.href,
    );

    console.log("\n[8] Подтверждение почты: страница не гасит ссылку");
    const confirmToken = await issueLink(owner.id, newMail, "EMAIL_CONFIRM");
    const opened = await fetch(`${SMOKE_URL}/confirm/${confirmToken}`);
    const stillAlive = await prisma.oneTimeLink.findFirst({
      where: { userId: owner.id, purpose: "EMAIL_CONFIRM", usedAt: null },
    });
    check("открытие страницы — 200", opened.status === 200, `${opened.status}`);
    check("ссылка после открытия жива", !!stillAlive);
    const confirm = () =>
      callAction("confirmEmailAction", [{}, form({ token: confirmToken })]);
    const pressed = await confirm();
    const confirmed = await prisma.user.findUnique({
      where: { id: owner.id },
      select: { emailConfirmedAt: true },
    });
    check("кнопка подтверждает", pressed.body.includes("Адрес подтверждён"));
    check("в базе подтверждён", confirmed?.emailConfirmedAt instanceof Date);
    check(
      "второе нажатие — ссылка уже сработала",
      (await confirm()).body.includes("Ссылка не сработала"),
    );

    console.log("\n[9] Смена пароля из профиля");
    const changer = await prisma.user.create({
      data: {
        login: `chg_${run}`,
        passwordHash: await hash(password),
        nickname: "Меняющий",
        avatarId: 3,
        email: `chg-${run}@local.test`,
        emailConfirmedAt: new Date(),
      },
      select: { id: true, login: true },
    });
    extra.push(changer.id);
    const oldSession = await signSessionToken(changer.id, 3600);
    // Сессии сравниваются по секундам: старая должна быть выдана раньше смены.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const newPassword = `new-${run}-secret`;
    const change = (current: string) =>
      callAction(
        "changePasswordAction",
        [{}, form({ current, password: newPassword })],
        // Со страницы профиля, как браузер: пересланный с чужой страницы
        // экшен теряет Set-Cookie, и новой сессии было бы не увидеть.
        { token: oldSession, address: ip(200), path: "/profile" },
      );
    const wrongCurrent = await change("not-my-password");
    check(
      "чужой текущий — отказ",
      wrongCurrent.body.includes("Пароль не подходит"),
    );
    check("до смены старая сессия жива", (await profile(oldSession)) === 200);
    const changed = await change(password);
    check("сменён", changed.body.includes("Пароль сменён"));
    check(
      "старая сессия больше не пускает",
      (await profile(oldSession)) !== 200,
    );
    check(
      "а выданная взамен — пускает",
      changed.session !== null && (await profile(changed.session)) === 200,
    );
    const relogin = await callAction(
      "loginAction",
      [{}, form({ login: changer.login, password: newPassword })],
      { address: ip(201) },
    );
    check(
      "вход с новым паролем",
      relogin.redirect?.startsWith("/games") === true,
    );
    await settle();
    check(
      "письмо о смене пароля",
      (await letters(`chg-${run}@local.test`, "Пароль сменён")) === 1,
    );

    console.log("\n[10] Выйти на всех устройствах");
    const phone = await signSessionToken(walker.id, 3600);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const laptop = await signSessionToken(walker.id, 3600);
    const out = await callAction("logoutEverywhereAction", [], {
      token: laptop,
      path: "/profile",
    });
    check("готово", out.body.includes("сессии закрыты"));
    check("телефон выкинут", (await profile(phone)) !== 200);
    check(
      "этому устройству выдана свежая",
      out.session !== null && (await profile(out.session)) === 200,
    );
  } finally {
    await prisma.user.deleteMany({
      where: { id: { in: [owner.id, walker.id, ...extra] } },
    });
  }

  console.log(
    failures === 0
      ? "\nВсе проверки прошли\n"
      : `\nПровалено проверок: ${failures}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

function reply(value: { redirect: string | null }): string {
  return value.redirect ?? "без редиректа";
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

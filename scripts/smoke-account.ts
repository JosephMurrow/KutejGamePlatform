import { hash } from "@node-rs/argon2";
import { signSessionToken } from "../src/lib/auth/token";
import { prisma } from "../src/lib/prisma";
import { callAction, form, SMOKE_URL } from "./actions";

/**
 * Смоук: смена почты и возврат после входа (docs/SECURITY.md, S-B3, S-B4).
 *
 * S-B3 — почта меняется только с паролем, прежний подтверждённый адрес
 * получает письмо о смене, а форма почты не служит обходом лимита входа.
 * S-B4 — параметр `next` не уводит на чужой домен ни через экшен входа, ни
 * через `proxy.ts`.
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
  } finally {
    await prisma.user.deleteMany({
      where: { id: { in: [owner.id, walker.id] } },
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

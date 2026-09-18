import { hash } from "@node-rs/argon2";
import { prisma } from "../src/lib/prisma";
import { signSessionToken } from "../src/lib/auth/token";
import { callAction, form, SMOKE_URL } from "./actions";

/**
 * Смоук: лимиты на вход, регистрацию и письма (docs/SECURITY.md, S-B1, S-B2).
 *
 * Экшены зовутся как у постороннего (`./actions.ts`), а разные клиенты
 * изображаются заголовком `X-Forwarded-For`: локально прокси нет, и сервер
 * ему верит. Письма ловит локальный mailpit — по его API и считаем, сколько
 * их дошло на адрес.
 *
 * Лимиты живут в памяти сервера, поэтому всё здесь с меткой прогона — логины,
 * адреса почты, адреса клиентов, — иначе второй прогон упёрся бы в счётчики
 * первого. Одна оговорка: общий потолок писем процесса (60 в час) один на
 * всех, а прогон тратит девять писем. Больше шести прогонов в час на одном
 * сервере — и смоук упрётся в него; перезапуск сервера обнуляет счётчик.
 *
 * Нужна прод-сборка и mailpit (`npm run db:up`). Запуск: npm run smoke:limits
 */

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const run = Date.now().toString(36);
/** Адрес клиента с меткой прогона: у каждого раздела свой. */
const ip = (block: number, n: number) =>
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

const WRONG = "Неверный логин или пароль";
const TOO_MANY = "Слишком много попыток входа";

function login(login: string, password: string, address: string) {
  return callAction("loginAction", [{}, form({ login, password })], {
    address,
  });
}

/** Сколько писем mailpit принял на адрес. */
async function lettersTo(address: string): Promise<number> {
  const res = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
  );
  const data = (await res.json()) as { messages_count: number };
  return data.messages_count;
}

async function member(suffix: string, password: string) {
  return prisma.user.create({
    data: {
      login: `lim_${run}_${suffix}`,
      passwordHash: await hash(password),
      nickname: `Лимит ${suffix}`,
      avatarId: 1,
    },
    select: { id: true, login: true },
  });
}

async function main() {
  console.log(`Смоук лимитов: ${SMOKE_URL}, прогон ${run}\n`);

  const password = `pw-${run}-secret`;
  const anya = await member("anya", password);
  const borya = await member("borya", password);
  const created: string[] = [anya.id, borya.id];
  const registered: string[] = [];

  try {
    console.log("[1] Перебор пароля упирается в счётчик логина");
    for (let i = 0; i < 10; i++) {
      const reply = await login(anya.login, "wrong-password", ip(1, i));
      if (!reply.body.includes(WRONG)) {
        check(
          `попытка ${i + 1} — обычный отказ`,
          false,
          reply.body.slice(0, 80),
        );
      }
    }
    const eleventh = await login(anya.login, "wrong-password", ip(1, 50));
    check("одиннадцатая — «слишком много»", eleventh.body.includes(TOO_MANY));
    const rightButLate = await login(anya.login, password, ip(1, 51));
    check(
      "даже верный пароль не пускает, пока окно не прошло",
      rightButLate.body.includes(TOO_MANY) && rightButLate.redirect === null,
    );

    console.log("\n[2] Выдуманный логин считается так же");
    const ghost = `nobody_${run}`;
    for (let i = 0; i < 10; i++) await login(ghost, "x", ip(2, i));
    const ghostReply = await login(ghost, "x", ip(2, 50));
    check("отказ тот же, что у настоящего", ghostReply.body.includes(TOO_MANY));

    console.log("\n[3] Вспомнил пароль — неудачи забыты");
    for (let i = 0; i < 3; i++) await login(borya.login, "wrong", ip(3, i));
    const ok = await login(borya.login, password, ip(3, 10));
    check(
      "вошёл",
      ok.redirect?.startsWith("/games") === true,
      ok.redirect ?? "без редиректа",
    );
    for (let i = 0; i < 9; i++)
      await login(borya.login, "wrong", ip(3, 20 + i));
    const tenth = await login(borya.login, "wrong", ip(3, 40));
    check(
      "счёт пошёл заново: десятая неудача ещё обычная",
      tenth.body.includes(WRONG),
    );

    console.log("\n[4] Перебор по многим логинам упирается в адрес");
    const crowd = ip(4, 1);
    for (let i = 0; i < 30; i++) await login(`many_${run}_${i}`, "x", crowd);
    const thirtyFirst = await login(`many_${run}_x`, "x", crowd);
    check("31-я попытка с адреса — отказ", thirtyFirst.body.includes(TOO_MANY));
    const neighbour = await login(`many_${run}_x`, "x", ip(4, 2));
    check("соседний адрес не задет", neighbour.body.includes(WRONG));

    console.log("\n[5] Регистрации с одного адреса");
    const home = ip(5, 1);
    const register = (n: number) =>
      callAction(
        "registerAction",
        [
          {},
          form({
            login: `reg_${run}_${n}`,
            password,
            nickname: `Рег ${n}`,
            email: `reg-${run}-${n}@local.test`,
            adult: "on",
          }),
        ],
        { address: home },
      );
    for (let n = 0; n < 5; n++) {
      const reply = await register(n);
      if (reply.redirect === null) {
        check(`регистрация ${n + 1} прошла`, false, reply.body.slice(0, 120));
      }
    }
    const sixth = await register(5);
    check(
      "шестая за час — отказ",
      sixth.redirect === null && sixth.body.includes("С этого адреса"),
    );
    const madeUsers = await prisma.user.findMany({
      where: { login: { startsWith: `reg_${run}_` } },
      select: { id: true },
    });
    registered.push(...madeUsers.map((user) => user.id));
    check(
      "аккаунтов заведено пять",
      madeUsers.length === 5,
      `${madeUsers.length}`,
    );

    console.log("\n[6] Письма на один адрес");
    const token = await signSessionToken(borya.id, 3600);
    const target = `bomb-${run}@local.test`;
    const attach = (email: string) =>
      callAction("attachEmailAction", [{}, form({ email })], { token });

    for (let i = 0; i < 3; i++) {
      const reply = await attach(target);
      if (!reply.body.includes("Письмо ушло")) {
        check(`письмо ${i + 1} ушло`, false, reply.body.slice(0, 120));
      }
    }
    const fourth = await attach(target);
    check(
      "четвёртое — отказ по квоте адреса",
      fourth.body.includes("писем на него уже было достаточно"),
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    const delivered = await lettersTo(target);
    check("в ящик дошло три", delivered === 3, `${delivered}`);

    console.log("\n[7] Один аккаунт не крутит адреса по кругу");
    await attach(`spin-${run}-a@local.test`);
    const sixthAttach = await attach(`spin-${run}-b@local.test`);
    const after = await prisma.user.findUnique({
      where: { id: borya.id },
      select: { email: true },
    });
    check(
      "шестая просьба за час — отказ",
      sixthAttach.body.includes("Писем было уже несколько"),
    );
    check(
      "адрес при отказе не поменялся",
      after?.email === `spin-${run}-a@local.test`,
      after?.email ?? "",
    );
  } finally {
    await prisma.user.deleteMany({
      where: { id: { in: [...created, ...registered] } },
    });
    await prisma.user.deleteMany({
      where: { login: { startsWith: `reg_${run}_` } },
    });
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

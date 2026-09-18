import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { hash } from "@node-rs/argon2";
import { SESSION_COOKIE, signSessionToken } from "../src/lib/auth/token";
import { prisma } from "../src/lib/prisma";

/**
 * Тестовые аккаунты для агента — только на локальной базе.
 *
 * Агенту нужно заходить в игру в браузере, чтобы проверить свою правку
 * глазами, а заводить аккаунт через форму и вводить пароль ему нельзя. Этот
 * скрипт делает два аккаунта прямо в базе и выписывает на них сессии. Агент
 * ставит сессию в cookie, пароль не вводится. Два аккаунта — чтобы сыграть
 * партию «сам с собой» в двух вкладках-контекстах или посмотреть глазами
 * зрителя.
 *
 * Логины, пароли и сессии ложатся в `.agent/credentials.json`, а этот файл
 * в `.gitignore`. Пароль — чтобы хозяин мог войти под тем же аккаунтом руками.
 * Повторный запуск пароли сохраняет, а сессии выписывает свежие.
 *
 * Как пользоваться — docs/TESTING.md, «Проверка в браузере».
 */

const FILE = ".agent/credentials.json";
/** Сессия живёт тридцать дней, как обычная. */
const SESSION_SECONDS = 60 * 60 * 24 * 30;

const ACCOUNTS = [
  { login: "agent_one", nickname: "Агент Один", avatarId: 3 },
  { login: "agent_two", nickname: "Агент Два", avatarId: 17 },
] as const;

interface Saved {
  login: string;
  password: string;
}

/** Скрипт только для своей машины: боевую базу он не тронет. */
function refuseRemote(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Не для боевого окружения: NODE_ENV=production");
  }

  const url = process.env.DATABASE_URL ?? "";
  const host = /@([^:/?]+)/.exec(url)?.[1] ?? "";
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(
      `База не локальная (${host || "адрес не разобран"}) — тестовые аккаунты заводятся только на своей машине`,
    );
  }
}

async function savedPasswords(): Promise<Map<string, string>> {
  try {
    const file = JSON.parse(await readFile(FILE, "utf8")) as {
      accounts?: Saved[];
    };
    return new Map(
      (file.accounts ?? []).map((account) => [account.login, account.password]),
    );
  } catch {
    return new Map();
  }
}

async function main(): Promise<void> {
  refuseRemote();
  const known = await savedPasswords();
  const accounts = [];

  for (const account of ACCOUNTS) {
    const password =
      known.get(account.login) ?? randomBytes(12).toString("hex");
    const passwordHash = await hash(password);

    const user = await prisma.user.upsert({
      where: { login: account.login },
      create: {
        login: account.login,
        passwordHash,
        nickname: account.nickname,
        avatarId: account.avatarId,
        adultConfirmedAt: new Date(),
      },
      // Пароль приводим к записанному: вдруг его меняли руками в профиле.
      update: { passwordHash, sessionsValidFrom: null },
      select: { id: true },
    });

    accounts.push({
      login: account.login,
      password,
      nickname: account.nickname,
      userId: user.id,
      session: await signSessionToken(user.id, SESSION_SECONDS),
    });
  }

  await mkdir(".agent", { recursive: true });
  await writeFile(
    FILE,
    `${JSON.stringify(
      {
        note: "Локальные тестовые аккаунты агента. Не коммитить. Пересоздать: npm run agent:accounts",
        cookie: SESSION_COOKIE,
        howTo: `В браузере на localhost: document.cookie = "${SESSION_COOKIE}=<session>; path=/", затем перезагрузить страницу`,
        createdAt: new Date().toISOString(),
        accounts,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Готово: ${accounts.map((a) => a.login).join(", ")} → ${FILE}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

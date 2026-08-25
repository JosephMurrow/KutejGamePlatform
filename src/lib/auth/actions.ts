"use server";

import { hash, verify } from "@node-rs/argon2";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "../prisma";
import { AVATAR_COUNT, randomAvatarId } from "../avatars";
import { RateLimiter } from "../../server/rate-limit";
import { confirmLetter, resetLetter, welcomeLetter } from "../mail/letters";
import { sendLetter } from "../mail/send";
import type { FormState } from "./form-state";
import { claimLink, issueLink } from "./links";
import { endSession, getSessionUserId, startSession } from "./session";
import {
  emailOnlySchema,
  fieldErrorsFrom,
  loginFormSchema,
  newPasswordSchema,
  normalizeLogin,
  profileSchema,
  registerSchema,
} from "./validation";

/**
 * Куда вернуть после входа. Принимаем только относительный путь: внешний адрес
 * в этом параметре — это открытый редирект.
 */
function safeNext(value: FormDataEntryValue | null): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/profile";
}

/** На каком поле сработала уникальность: Prisma кладёт его в meta.target. */
function uniqueField(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("meta" in error)) {
    return null;
  }

  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) return String(target[0] ?? "");
  return typeof target === "string" ? target : null;
}

/** Prisma кидает P2002 при нарушении уникальности. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

export async function registerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const adultConfirmed = formData.get("adult") === "on";
  const values = {
    login: String(formData.get("login") ?? ""),
    nickname: String(formData.get("nickname") ?? ""),
    email: String(formData.get("email") ?? ""),
    adult: adultConfirmed ? "on" : "",
  };

  if (!adultConfirmed) {
    return {
      values,
      fieldErrors: {
        adult: "Без подтверждения возраста играть нельзя — вопросы взрослые",
      },
    };
  }

  const parsed = registerSchema.safeParse({
    login: values.login,
    password: String(formData.get("password") ?? ""),
    nickname: values.nickname,
    email: values.email,
  });

  if (!parsed.success) {
    return { values, fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const login = normalizeLogin(parsed.data.login);
  let userId: string;

  try {
    const user = await prisma.user.create({
      data: {
        login,
        passwordHash: await hash(parsed.data.password),
        nickname: parsed.data.nickname,
        email: parsed.data.email,
        avatarId: randomAvatarId(),
        adultConfirmedAt: new Date(),
      },
      select: { id: true },
    });
    userId = user.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Уникальны и логин, и адрес. Prisma говорит, на каком поле споткнулась.
      const field = uniqueField(error) === "email" ? "email" : "login";
      return {
        values,
        fieldErrors: {
          [field]:
            field === "email"
              ? "На этот адрес уже заведён аккаунт"
              : "Такой логин уже занят",
        },
      };
    }
    console.error("Регистрация не удалась:", error);
    return { values, error: "Что-то сломалось на сервере. Попробуй ещё раз." };
  }

  // Письмо уходит в фоне: почта может тормозить или не отвечать вовсе, а
  // регистрация должна заканчиваться сразу. Не дошло — человек запросит
  // письмо заново в профиле.
  void notifyRegistered(userId, login, parsed.data.email);

  await startSession(userId);
  redirect(safeNext(formData.get("next")));
}

/** Письмо о регистрации со ссылкой на подтверждение адреса. */
async function notifyRegistered(
  userId: string,
  login: string,
  email: string,
): Promise<void> {
  try {
    const token = await issueLink(userId, email, "EMAIL_CONFIRM");
    await sendLetter(email, welcomeLetter(login, token));
  } catch (error) {
    console.error("Письмо о регистрации не ушло:", error);
  }
}

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = { login: String(formData.get("login") ?? "") };

  const parsed = loginFormSchema.safeParse({
    login: values.login,
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return { values, fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const user = await prisma.user.findUnique({
    where: { login: normalizeLogin(parsed.data.login) },
    select: { id: true, passwordHash: true, isBot: true },
  });

  // Одинаковый текст на неизвестный логин и на неверный пароль: не подсказываем,
  // какие логины заняты.
  const wrong: FormState = { values, error: "Неверный логин или пароль" };
  // Боты «Forever alone» — обычные записи в таблице, но входить под ними нельзя.
  if (!user || user.isBot) return wrong;

  const passwordOk = await verify(user.passwordHash, parsed.data.password);
  if (!passwordOk) return wrong;

  await startSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/");
}

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/login");
  }

  const values = { nickname: String(formData.get("nickname") ?? "") };

  const parsed = profileSchema.safeParse({
    nickname: values.nickname,
    avatarId: String(formData.get("avatarId") ?? ""),
  });

  if (!parsed.success) {
    return { values, fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  if (parsed.data.avatarId >= AVATAR_COUNT) {
    return { values, fieldErrors: { avatarId: "Такого аватара нет" } };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      nickname: parsed.data.nickname,
      avatarId: parsed.data.avatarId,
    },
  });

  revalidatePath("/profile");
  return { ok: "Сохранено" };
}

/**
 * Прикрепить или сменить адрес почты и отправить письмо с подтверждением.
 *
 * Отдельным действием, а не частью профиля: адрес меняет способ восстановить
 * аккаунт, и мешать его в одну форму с ником и аватаром не стоит.
 */
export async function attachEmailAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/login");
  }

  const values = { email: String(formData.get("email") ?? "") };
  const parsed = emailOnlySchema.safeParse(values);

  if (!parsed.success) {
    return { values, fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const email = parsed.data.email;
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { login: true, email: true, emailConfirmedAt: true },
  });

  if (!me) redirect("/login");

  // Тот же адрес и уже подтверждён — слать нечего.
  if (me.email === email && me.emailConfirmedAt !== null) {
    return { values, error: "Этот адрес уже подтверждён" };
  }

  if (me.email !== email) {
    try {
      await prisma.user.update({
        where: { id: userId },
        // Новый адрес всегда неподтверждён, даже если старый был подтверждён.
        data: { email, emailConfirmedAt: null },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return {
          values,
          fieldErrors: { email: "На этот адрес уже заведён аккаунт" },
        };
      }
      console.error("Не удалось сохранить адрес:", error);
      return {
        values,
        error: "Что-то сломалось на сервере. Попробуй ещё раз.",
      };
    }
  }

  const token = await issueLink(userId, email, "EMAIL_CONFIRM");
  const sent = await sendLetter(email, confirmLetter(me.login, token));

  revalidatePath("/profile");

  return sent
    ? { values, ok: `Письмо ушло на ${email}. Перейди по ссылке из него.` }
    : {
        values,
        error:
          "Адрес сохранён, но письмо отправить не удалось — отправка почты " +
          "сейчас не настроена. Попробуй позже.",
      };
}

/**
 * Ограничение на запросы восстановления: по одному ключу не чаще трёх раз за
 * четверть часа. Ключ — то, что ввели, поэтому перебор чужих логинов упирается
 * в него так же, как и попытки завалить один ящик письмами.
 */
const resetLimiter = new RateLimiter(3, 15 * 60 * 1000);

/**
 * Запрос на восстановление пароля по логину или адресу почты.
 *
 * Ответ одинаковый всегда — и на существующий аккаунт, и на выдуманный.
 * Иначе форма превращается в удобный перебиратель чужих логинов.
 */
export async function requestResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = String(formData.get("identity") ?? "").trim();
  const values = { identity: raw };

  if (raw === "") {
    return { values, fieldErrors: { identity: "Введи логин или адрес почты" } };
  }

  const done: FormState = {
    values,
    ok:
      "Если такой аккаунт есть и его адрес подтверждён, письмо уже в пути. " +
      "Проверь почту, в том числе папку со спамом.",
  };

  if (!resetLimiter.allow(raw.toLowerCase())) return done;

  const user = await prisma.user.findFirst({
    where: {
      isBot: false,
      emailConfirmedAt: { not: null },
      OR: [{ login: normalizeLogin(raw) }, { email: raw.toLowerCase() }],
    },
    select: { id: true, login: true, email: true },
  });

  // Аккаунта нет, почты нет или она не подтверждена — молчим и отвечаем
  // ровно то же самое.
  if (!user?.email) return done;

  try {
    const token = await issueLink(user.id, user.email, "PASSWORD_RESET");
    await sendLetter(user.email, resetLetter(user.login, token));
  } catch (error) {
    console.error("Письмо для восстановления не ушло:", error);
  }

  return done;
}

/**
 * Новый пароль по ссылке из письма.
 *
 * После смены все прежние сессии этого аккаунта перестают работать: если
 * аккаунт увели, у настоящего владельца должен остаться способ выставить чужого.
 */
export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const parsed = newPasswordSchema.safeParse({
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const claimed = await claimLink(token, "PASSWORD_RESET");
  if (!claimed) {
    return {
      error:
        "Ссылка не сработала: она живёт час и срабатывает один раз. " +
        "Запроси восстановление заново.",
    };
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: claimed.userId },
      data: {
        passwordHash: await hash(parsed.data.password),
        // Всё, что выдано раньше этого момента, больше не действует.
        sessionsValidFrom: now,
      },
    }),
    // Остальные живые ссылки этого аккаунта тоже гасим: пароль уже сменили.
    prisma.oneTimeLink.updateMany({
      where: { userId: claimed.userId, usedAt: null },
      data: { usedAt: now },
    }),
  ]);

  // Новая сессия выдаётся после сдвига отметки, поэтому переживёт его.
  await startSession(claimed.userId);
  redirect("/play");
}

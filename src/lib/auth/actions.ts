"use server";

import { hash, verify } from "@node-rs/argon2";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "../prisma";
import { AVATAR_COUNT, randomAvatarId } from "../avatars";
import { RateLimiter } from "../../server/rate-limit";
import {
  confirmLetter,
  emailChangedLetter,
  passwordChangedLetter,
  resetLetter,
  welcomeLetter,
} from "../mail/letters";
import { maskAddress, sendLetter } from "../mail/send";
import type { FormState } from "./form-state";
import { claimLink, issueLink } from "./links";
import { LoginGuard } from "./login-guard";
import { requestAddress } from "../request-address";
import { safeInternalPath } from "../safe-path";
import { endSession, sessionMemberId, startSession } from "./session";
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
 * Куда вернуть после входа. Только внутрь сайта: внешний адрес в этом
 * параметре — открытый редирект (`safe-path.ts`, docs/SECURITY.md S-B4).
 *
 * Без `next` — на витрину: человек вошёл, чтобы играть, а не смотреть свой
 * профиль (docs/BACKLOG.md C1).
 */
function safeNext(value: FormDataEntryValue | null): string {
  return safeInternalPath(value) ?? "/games";
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

/** Час в миллисекундах: окно лимитов регистрации и почты. */
const HOUR_MS = 60 * 60 * 1000;

/**
 * Регистраций с одного адреса в час (docs/SECURITY.md, S-B2). Считаются только
 * состоявшиеся: ошибка в форме лимит не тратит. Пятеро за одним роутером —
 * это компания у телевизора, шестой за час — уже конвейер.
 */
const registerLimiter = new RateLimiter(5, HOUR_MS);

/**
 * Писем подтверждения по просьбе одного аккаунта в час. Квота на адрес
 * получателя стоит в `sendLetter`; эта не даёт одному аккаунту обходить её,
 * меняя адрес по кругу.
 */
const attachLimiter = new RateLimiter(5, HOUR_MS);

/** Сторож входа: неудачи по логину и попытки с адреса (S-B1). */
const loginGuard = new LoginGuard();

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
  const address = await requestAddress();

  if (registerLimiter.blocked(address)) {
    return {
      values,
      error:
        "С этого адреса сегодня уже заводили несколько аккаунтов. " +
        "Попробуй через час.",
    };
  }

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
    registerLimiter.hit(address);
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

  const login = normalizeLogin(parsed.data.login);

  // До argon2 и до базы: иначе отказ приходил бы уже после дорогой работы.
  if (!loginGuard.admit(login, await requestAddress())) {
    return {
      values,
      error:
        "Слишком много попыток входа. Подожди четверть часа и попробуй " +
        "снова — или восстанови пароль по почте.",
    };
  }

  const user = await prisma.user.findUnique({
    where: { login },
    select: { id: true, passwordHash: true, isBot: true },
  });

  // Одинаковый текст на неизвестный логин и на неверный пароль: не подсказываем,
  // какие логины заняты. Неудача засчитывается логину в обоих случаях — по той
  // же причине.
  const wrong: FormState = { values, error: "Неверный логин или пароль" };
  // Боты «Forever alone» — обычные записи в таблице, но входить под ними нельзя.
  if (!user || user.isBot) {
    loginGuard.failed(login);
    return wrong;
  }

  const passwordOk = await verify(user.passwordHash, parsed.data.password);
  if (!passwordOk) {
    loginGuard.failed(login);
    return wrong;
  }

  loginGuard.succeeded(login);
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
  // Только полноценный игрок: гостю ник меняет хозяин комнаты, через фильтр.
  const userId = await sessionMemberId();
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
  // Гостю почта не положена: через неё он сбросил бы пароль и остался
  // насовсем, а гость живёт одну комнату.
  const userId = await sessionMemberId();
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
    select: {
      login: true,
      email: true,
      emailConfirmedAt: true,
      passwordHash: true,
    },
  });

  if (!me) redirect("/login");

  // Тот же адрес и уже подтверждён — слать нечего.
  if (me.email === email && me.emailConfirmedAt !== null) {
    return { values, error: "Этот адрес уже подтверждён" };
  }

  // До сохранения адреса: отказ не должен оставлять почту поменянной.
  if (!attachLimiter.allow(userId)) {
    return {
      values,
      error: "Писем было уже несколько. Проверь почту или попробуй через час.",
    };
  }

  // Смена адреса — это смена способа вернуть аккаунт, поэтому только с
  // паролем (docs/SECURITY.md, S-B3). Иначе укравший сессию привязал бы свою
  // почту, сбросил пароль и увёл аккаунт насовсем. Повторное письмо на тот же
  // адрес ничего не меняет — там пароль не спрашиваем.
  const changing = me.email !== email;
  if (changing) {
    const problem = await checkCurrentPassword(
      me.login,
      me.passwordHash,
      String(formData.get("password") ?? ""),
    );
    if (problem) return { values, fieldErrors: { password: problem } };
  }

  if (changing) {
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

  // Прежний подтверждённый адрес узнаёт о смене: если это был не хозяин,
  // хозяин должен узнать сразу, а не когда полезет восстанавливать пароль.
  if (changing && me.email && me.emailConfirmedAt) {
    void sendLetter(me.email, emailChangedLetter(me.login, maskAddress(email)));
  }

  const token = await issueLink(userId, email, "EMAIL_CONFIRM");
  const outcome = await sendLetter(email, confirmLetter(me.login, token));

  revalidatePath("/profile");

  switch (outcome) {
    case "sent":
      return {
        values,
        ok: `Письмо ушло на ${email}. Перейди по ссылке из него.`,
      };
    case "limit":
      return {
        values,
        error:
          "Адрес сохранён, но писем на него уже было достаточно. Проверь " +
          "почту, в том числе спам, или запроси письмо через час.",
      };
    default:
      return {
        values,
        error:
          "Адрес сохранён, но письмо отправить не удалось — отправка почты " +
          "сейчас не настроена. Попробуй позже.",
      };
  }
}

/**
 * Текущий пароль для чувствительного действия. `null` — подошёл, строка —
 * что сказать под полем.
 *
 * Неудачи считает тот же сторож, что и вход: иначе форма почты стала бы
 * обходным путём для перебора пароля.
 */
async function checkCurrentPassword(
  login: string,
  passwordHash: string,
  password: string,
): Promise<string | null> {
  if (password === "") return "Введи текущий пароль";

  if (!loginGuard.admit(login, await requestAddress())) {
    return "Слишком много попыток. Подожди четверть часа.";
  }

  if (!(await verify(passwordHash, password))) {
    loginGuard.failed(login);
    return "Пароль не подходит";
  }

  loginGuard.succeeded(login);
  return null;
}

/**
 * Лимиты восстановления пароля (docs/SECURITY.md, S-B7).
 *
 * Раньше ключом была введённая строка: логин и почта одного аккаунта давали
 * два счётчика — вдвое больше писем, — а каждая выдуманная строка заводила
 * свой ключ. Теперь два счётчика по сути дела:
 *
 * - **на аккаунт** — сколько писем получит один человек, как его ни называй;
 * - **на адрес клиента** — сколько раз вообще можно дёрнуть форму, в том
 *   числе с выдуманными логинами, по которым письма и так не уходят.
 *
 * Ответ формы от лимитов не меняется: иначе по нему узнавали бы, есть ли
 * такой аккаунт.
 */
const RESET_WINDOW_MS = 15 * 60 * 1000;
const resetPerAccount = new RateLimiter(3, RESET_WINDOW_MS);
const resetPerAddress = new RateLimiter(10, RESET_WINDOW_MS);

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

  if (!resetPerAddress.allow(await requestAddress())) return done;

  const user = await prisma.user.findFirst({
    where: {
      isBot: false,
      // Гостю восстанавливать нечего: пароля у него нет и не будет.
      isGuest: false,
      emailConfirmedAt: { not: null },
      OR: [{ login: normalizeLogin(raw) }, { email: raw.toLowerCase() }],
    },
    select: { id: true, login: true, email: true },
  });

  // Аккаунта нет, почты нет или она не подтверждена — молчим и отвечаем
  // ровно то же самое.
  if (!user?.email) return done;
  if (!resetPerAccount.allow(user.id)) return done;

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

  // Ссылку гостю не выдают (см. requestResetAction), но проверка стоит и
  // здесь: пароль гостю превратил бы одноразовый профиль в постоянный.
  const owner = await prisma.user.findUnique({
    where: { id: claimed.userId },
    select: { isGuest: true, isBot: true },
  });
  if (!owner || owner.isGuest || owner.isBot) {
    return { error: "Ссылка не сработала. Запроси восстановление заново." };
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
  // На главную, а не в игровой зал: платформенный экшен не знает, во что
  // человек играет (docs/BACKLOG.md A6).
  redirect("/");
}

/**
 * Смена пароля из профиля (docs/SECURITY.md, S-B5).
 *
 * Только со знанием текущего: укравший сессию пароль не сменит. Все прежние
 * сессии после смены перестают действовать — как и после сброса по почте, —
 * а текущая выдаётся заново, чтобы человек остался в игре.
 */
export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const userId = await sessionMemberId();
  if (!userId) {
    redirect("/login");
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      login: true,
      passwordHash: true,
      email: true,
      emailConfirmedAt: true,
    },
  });
  if (!me) redirect("/login");

  const problem = await checkCurrentPassword(
    me.login,
    me.passwordHash,
    String(formData.get("current") ?? ""),
  );
  if (problem) return { fieldErrors: { current: problem } };

  const parsed = newPasswordSchema.safeParse({
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hash(parsed.data.password),
        sessionsValidFrom: now,
      },
    }),
    // Живые ссылки сброса выданы под старый пароль — гасим.
    prisma.oneTimeLink.updateMany({
      where: { userId, usedAt: null, purpose: "PASSWORD_RESET" },
      data: { usedAt: now },
    }),
  ]);

  // Новая сессия — после сдвига отметки, поэтому переживёт его.
  await startSession(userId);

  // Если пароль менял не хозяин, хозяин узнает по почте.
  if (me.email && me.emailConfirmedAt) {
    void sendLetter(me.email, passwordChangedLetter(me.login));
  }

  return {
    ok: "Пароль сменён. На остальных устройствах придётся войти заново.",
  };
}

/**
 * Выйти на всех устройствах (docs/SECURITY.md, S-B5). Сессия — подписанный
 * токен на тридцать дней, и «выйти» на одном устройстве только стирает там
 * cookie. Здесь сдвигается отметка, раньше которой сессии не действуют, — и
 * для страниц, и для сокетов. Текущему устройству выдаётся свежая.
 */
export async function logoutEverywhereAction(): Promise<FormState> {
  const userId = await sessionMemberId();
  if (!userId) {
    redirect("/login");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { sessionsValidFrom: new Date() },
  });
  await startSession(userId);

  return { ok: "Готово: на остальных устройствах сессии закрыты." };
}

/**
 * Подтверждение почты по кнопке, а не по открытию страницы
 * (docs/SECURITY.md, S-B6). Почтовые сканеры и предпросмотр в мессенджерах
 * открывают ссылку раньше человека; раньше это и гасило её.
 *
 * Без проверки сессии — осознанно: пропуск здесь сама ссылка, и подтвердить
 * адрес можно, не входя в игру, например с телефона, где сессии нет.
 */
export async function confirmEmailAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const claimed = await claimLink(
    String(formData.get("token") ?? ""),
    "EMAIL_CONFIRM",
  );
  if (!claimed) {
    return {
      error:
        "Ссылка не сработала: она живёт час и срабатывает один раз. " +
        "Запроси новую в профиле.",
    };
  }

  // Подтверждаем тот адрес, на который ушло письмо: человек мог успеть
  // поменять почту в профиле, пока письмо шло.
  const { count } = await prisma.user.updateMany({
    where: { id: claimed.userId, email: claimed.email },
    data: { emailConfirmedAt: new Date() },
  });

  return count === 1
    ? { ok: "Адрес подтверждён. Теперь забытый пароль можно восстановить." }
    : {
        error:
          "Почту аккаунта успели сменить, пока шло письмо. Подтверди новый " +
          "адрес по письму, которое ушло на него.",
      };
}

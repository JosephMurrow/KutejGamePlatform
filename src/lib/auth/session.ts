import { cookies } from "next/headers";
import { securityLog } from "../../server/security-log";
import { prisma } from "../prisma";
import { GUEST_SESSION_SECONDS } from "@/shared/guest";
import {
  readSessionClaims,
  sessionAlive,
  SESSION_COOKIE,
  signSessionToken,
} from "./token";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 дней

export async function startSession(
  userId: string,
  /** Гостевая сессия: короче обычной и с признаком прямо в токене. */
  guest = false,
): Promise<void> {
  const maxAge = guest ? GUEST_SESSION_SECONDS : SESSION_MAX_AGE_SECONDS;
  const token = await signSessionToken(userId, maxAge, guest);
  const store = await cookies();

  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Кто зовёт экшен: идентификатор и гость ли он. */
export interface SessionCaller {
  id: string;
  /** Гость стримерской комнаты: одноразовый профиль без пароля и почты. */
  isGuest: boolean;
}

/**
 * Кто за сессией — с учётом отзыва. Гость тоже: у него сессия настоящая.
 *
 * Отзыв проверяется здесь, а не в proxy.ts: тот намеренно не ходит в базу, это
 * быстрая развилка по подписи. Следствие честное — уведённая вкладка ещё
 * получит редирект, но ни страницу с данными, ни место за столом уже нет.
 *
 * Гость ли это, решает база, а не признак в токене: признак нужен только
 * быстрой развилке в proxy.ts.
 */
export async function sessionCaller(): Promise<SessionCaller | null> {
  const store = await cookies();
  const claims = await readSessionClaims(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { sessionsValidFrom: true, isGuest: true },
  });

  if (!user) return null;
  if (!sessionAlive(claims.issuedAt, user.sessionsValidFrom)) return null;

  return { id: claims.userId, isGuest: user.isGuest };
}

/**
 * Полноценный игрок — не гость. Этим начинается каждый серверный экшен, если
 * нет причины пускать гостя (docs/SECURITY.md, S-C1).
 *
 * proxy.ts закрывает гостю страницы, но не экшены: экшен зовётся с любой
 * страницы, а проверка «есть ли сессия» гостя пропускает. Так гость менял ник
 * мимо фильтра, заводил комнаты и привязывал почту, чтобы потом сбросить
 * пароль и остаться насовсем.
 */
export async function sessionMemberId(): Promise<string | null> {
  const caller = await sessionCaller();
  if (caller?.isGuest) {
    securityLog("экшен: гостю отказано", { user: caller.id }, caller.id);
    return null;
  }
  return caller?.id ?? null;
}

/**
 * Идентификатор за сессией, гость или нет. Для страниц, которые сами
 * разбираются с гостем, и для кода, которому всё равно, кто это.
 */
export async function getSessionUserId(): Promise<string | null> {
  return (await sessionCaller())?.id ?? null;
}

export interface CurrentUser {
  id: string;
  login: string;
  nickname: string;
  avatarId: number;
  /** Почта. Может не быть: аккаунты старше писем живут без неё. */
  email: string | null;
  /** Момент подтверждения адреса; без него восстановление не работает. */
  emailConfirmedAt: Date | null;
  /** Гость стримерской комнаты: ему доступна только она. */
  isGuest: boolean;
  /** Комната гостя. У полноценного игрока — null. */
  guestRoomId: string | null;
}

/**
 * Текущий игрок или null. Токен может быть валидным, но пользователя уже нет
 * (удалён) — тогда тоже null.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      login: true,
      nickname: true,
      avatarId: true,
      email: true,
      emailConfirmedAt: true,
      isGuest: true,
      guestRoomId: true,
    },
  });

  return user;
}

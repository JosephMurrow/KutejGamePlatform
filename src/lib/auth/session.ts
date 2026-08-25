import { cookies } from "next/headers";
import { prisma } from "../prisma";
import {
  readSessionClaims,
  sessionAlive,
  SESSION_COOKIE,
  signSessionToken,
} from "./token";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 дней

export async function startSession(userId: string): Promise<void> {
  const token = await signSessionToken(userId, SESSION_MAX_AGE_SECONDS);
  const store = await cookies();

  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Идентификатор игрока с учётом отзыва сессий.
 *
 * Отзыв проверяется здесь, а не в proxy.ts: тот намеренно не ходит в базу, это
 * быстрая развилка по подписи. Следствие честное — уведённая вкладка ещё
 * получит редирект, но ни страницу с данными, ни место за столом уже нет.
 */
export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const claims = await readSessionClaims(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { sessionsValidFrom: true },
  });

  if (!user) return null;
  return sessionAlive(claims.issuedAt, user.sessionsValidFrom)
    ? claims.userId
    : null;
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
    },
  });

  return user;
}

import { SignJWT, jwtVerify } from "jose";

/**
 * Подписанный сессионный токен. Читается и из серверных компонентов, и из
 * middleware, и из сокет-сервера, поэтому берёт секрет напрямую из окружения
 * и не тянет за собой остальную схему env.
 */
const ALGORITHM = "HS256";

/** Имя сессионной cookie. Живёт здесь, чтобы middleware не тянул Prisma. */
export const SESSION_COOKIE = "pt_session";

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET не задан или короче 32 символов");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  userId: string,
  maxAgeSeconds: number,
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secretKey());
}

export interface SessionClaims {
  userId: string;
  /** Когда токен выдан. Нужен, чтобы отличить сессию до смены пароля от новой. */
  issuedAt: Date;
}

/**
 * Разобрать токен. `null` — протух, подделан или мусорный.
 *
 * Проверка здесь чисто криптографическая, без похода в базу: этим же кодом
 * пользуется быстрая развилка в proxy.ts. Отзыв сессий проверяется отдельно,
 * там, где база и так под рукой.
 */
export async function readSessionClaims(
  token: string | undefined,
): Promise<SessionClaims | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: [ALGORITHM],
    });

    if (typeof payload.sub !== "string") return null;

    return {
      userId: payload.sub,
      issuedAt: new Date((payload.iat ?? 0) * 1000),
    };
  } catch {
    return null;
  }
}

/** Только идентификатор: для мест, где отзыв не проверяется. */
export async function readSessionToken(
  token: string | undefined,
): Promise<string | null> {
  return (await readSessionClaims(token))?.userId ?? null;
}

/**
 * Действует ли сессия с учётом отзыва. Сравнение по секундам: в токене время
 * выпуска хранится с точностью до секунды, и без округления сессия, выданная
 * в ту же секунду, что и смена пароля, отвалилась бы сразу.
 */
export function sessionAlive(issuedAt: Date, validFrom: Date | null): boolean {
  if (validFrom === null) return true;
  return (
    Math.floor(issuedAt.getTime() / 1000) >=
    Math.floor(validFrom.getTime() / 1000)
  );
}

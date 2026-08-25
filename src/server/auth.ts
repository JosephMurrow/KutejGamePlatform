import type { IncomingHttpHeaders } from "node:http";
import {
  readSessionClaims,
  sessionAlive,
  SESSION_COOKIE,
} from "../lib/auth/token";
import { prisma } from "../lib/prisma";

export interface SocketUser {
  id: string;
  nickname: string;
  avatarId: number;
}

/** Разбор заголовка Cookie без внешних зависимостей. */
function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;

    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }

  return null;
}

/**
 * Игрок за сокетом. Сессия та же, что и у страниц: подписанная cookie,
 * отдельного токена для сокетов не заводим.
 */
export async function authenticateSocket(
  headers: IncomingHttpHeaders,
): Promise<SocketUser | null> {
  const token = readCookie(headers.cookie, SESSION_COOKIE);
  const claims = await readSessionClaims(token ?? undefined);
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: {
      id: true,
      nickname: true,
      avatarId: true,
      sessionsValidFrom: true,
    },
  });

  if (!user) return null;

  // Сессия, выданная до смены пароля, за стол не пускает.
  if (!sessionAlive(claims.issuedAt, user.sessionsValidFrom)) return null;

  return { id: user.id, nickname: user.nickname, avatarId: user.avatarId };
}

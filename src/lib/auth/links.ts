import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Одноразовые ссылки из писем: подтверждение адреса и сброс пароля.
 *
 * В базе лежит только хеш — утёкшая таблица не должна давать доступ к
 * аккаунтам. Сама ссылка существует ровно один раз: в письме.
 */

export type LinkPurpose = "EMAIL_CONFIRM" | "PASSWORD_RESET";

/** Сколько живёт ссылка. Час — достаточно, чтобы дойти до почты и обратно. */
export const LINK_LIFETIME_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Выдать ссылку. Прежние невостребованные того же назначения гасятся: две
 * живые ссылки на один аккаунт — лишний способ им воспользоваться.
 */
export async function issueLink(
  userId: string,
  email: string,
  purpose: LinkPurpose,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");

  await prisma.$transaction([
    prisma.oneTimeLink.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.oneTimeLink.create({
      data: {
        tokenHash: hashToken(token),
        purpose,
        userId,
        email,
        expiresAt: new Date(Date.now() + LINK_LIFETIME_MS),
      },
    }),
  ]);

  return token;
}

export interface ClaimedLink {
  userId: string;
  email: string;
}

/**
 * Погасить ссылку и вернуть, кому она выдавалась. `null` — ссылки нет, срок
 * вышел или ею уже пользовались.
 *
 * Гашение и проверка идут одним запросом: иначе два одновременных перехода по
 * одной ссылке оба сочли бы её годной.
 */
export async function claimLink(
  token: string,
  purpose: LinkPurpose,
): Promise<ClaimedLink | null> {
  const link = await prisma.oneTimeLink.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      userId: true,
      email: true,
      purpose: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  if (!link || link.purpose !== purpose) return null;
  if (link.usedAt !== null) return null;
  if (link.expiresAt.getTime() < Date.now()) return null;

  const { count } = await prisma.oneTimeLink.updateMany({
    where: { id: link.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  return count === 1 ? { userId: link.userId, email: link.email } : null;
}

/** Убрать протухшие ссылки. Вызывается уборщиком комнат. */
export async function dropExpiredLinks(): Promise<number> {
  const { count } = await prisma.oneTimeLink.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  return count;
}

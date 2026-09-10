import { prisma } from "@/lib/prisma";
import type { Shown } from "../server/room";
import { idle, isProvisional, START_RATING } from "./glicko";

/**
 * Рейтинг для показа.
 *
 * Отклонение здесь досчитывается по простою — то же, что делает пересчёт перед
 * партией. Иначе не игравший год до своей первой партии выглядел бы увереннее,
 * чем есть на самом деле (src/games/chess/docs/BACKLOG.md E1).
 */

/** Строка рейтинга, какой её хватает для показа. */
export interface Stored {
  rating: number;
  deviation: number;
  ratedAt: Date;
}

/**
 * Рейтинг игрока, каким его видно за доской.
 *
 * `null` означает «показывать нечего» — за столом останется стартовое число, и
 * отдельной ветки «рейтинг не приехал» комнате не нужно.
 */
export async function shownRating(userId: string): Promise<Shown | null> {
  const row = await prisma.chessRating.findUnique({
    where: { userId },
    select: { rating: true, deviation: true, ratedAt: true },
  });

  // Не играл ни разу: это не ошибка, а начало пути.
  if (!row) return { rating: START_RATING, provisional: true };

  return {
    rating: Math.round(row.rating),
    provisional: provisional(row),
  };
}

/** Устоялся ли рейтинг с учётом простоя. */
export function provisional(row: Stored, now: Date = new Date()): boolean {
  return isProvisional({ deviation: idle(row, now) });
}

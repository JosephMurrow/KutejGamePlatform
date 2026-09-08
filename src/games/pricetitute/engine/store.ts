import { prisma } from "@/lib/prisma";
import { toStorage } from "./bet";
import type { RoundRecord } from "./room";

/**
 * Сохранение итогов раунда. Движок остаётся чистым, а запись в базу делает
 * транспорт, получив событие round_resolved.
 */
export async function persistRound(
  roomKey: string,
  record: RoundRecord,
): Promise<void> {
  const host = toStorage(record.hostAnswer);
  const winners = new Set(record.outcome.winners);

  // Раунд засчитывается ведущему и всем, кто успел поставить.
  const participants = new Set([
    record.hostId,
    ...record.bets.map((bet) => bet.playerId),
  ]);

  await prisma.$transaction(async (tx) => {
    await tx.round.create({
      data: {
        roomKey,
        questionId: record.questionId,
        hostId: record.hostId,
        hostSum: host.sum,
        hostNever: host.never,
        finishedAt: new Date(record.finishedAt),
        bets: {
          create: record.bets.map((entry) => {
            const stored = toStorage(entry.bet);
            return {
              playerId: entry.playerId,
              sum: stored.sum,
              never: stored.never,
              won: winners.has(entry.playerId),
            };
          }),
        },
      },
    });

    for (const playerId of participants) {
      const earned = winners.has(playerId) ? 1 : 0;

      await tx.score.upsert({
        where: { userId_roomKey: { userId: playerId, roomKey } },
        create: {
          userId: playerId,
          roomKey,
          points: earned,
          roundsPlayed: 1,
        },
        update: {
          points: { increment: earned },
          roundsPlayed: { increment: 1 },
        },
      });
    }
  });
}

export interface StoredStats {
  score: number;
  roundsPlayed: number;
}

/** Очки комнаты, чтобы поднять их в свежесозданную Room после перезапуска. */
export async function loadScores(
  roomKey: string,
): Promise<Map<string, StoredStats>> {
  const rows = await prisma.score.findMany({
    where: { roomKey },
    select: { userId: true, points: true, roundsPlayed: true },
  });

  return new Map(
    rows.map((row) => [
      row.userId,
      { score: row.points, roundsPlayed: row.roundsPlayed },
    ]),
  );
}

/** Убрать счёт вместе с приватной комнатой. */
export async function dropScores(roomKey: string): Promise<void> {
  await prisma.score.deleteMany({ where: { roomKey } });
}

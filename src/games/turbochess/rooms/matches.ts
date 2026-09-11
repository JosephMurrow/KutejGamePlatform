import { prisma } from "@/lib/prisma";
import type { MatchDraft } from "../server/room";

/**
 * Сыгранные партии: запись и уборка.
 *
 * Партия хранится тем, из чего восстанавливается: режимом, его ручками,
 * зерном случайности и ходами (docs/BACKLOG.md C3). Места — отдельной
 * таблицей: в королевской битве их четыре.
 */

/**
 * Записать партию. Ники берутся здесь и запоминаются навсегда: человек сменит
 * ник, а история партии меняться не должна.
 */
export async function saveMatch(draft: MatchDraft): Promise<void> {
  const people = await prisma.user.findMany({
    where: { id: { in: draft.seats } },
    select: { id: true, nickname: true },
  });
  const nameOf = (id: string) =>
    people.find((person) => person.id === id)?.nickname ?? "—";

  const data = {
    roomKey: draft.roomKey,
    mode: draft.mode,
    options: draft.options,
    seed: draft.seed,
    timeControl: draft.timeControl,
    moves: draft.moves,
    times: draft.times,
    winner: draft.winner,
    reason: draft.reason,
    startedAt: draft.startedAt,
    endedAt: new Date(),
  };

  await prisma.$transaction([
    prisma.turboMatch.upsert({
      where: { id: draft.id },
      create: { id: draft.id, ...data },
      update: data,
    }),
    prisma.turboMatchSeat.deleteMany({ where: { matchId: draft.id } }),
    prisma.turboMatchSeat.createMany({
      data: draft.seats.map((userId, seat) => ({
        matchId: draft.id,
        seat,
        userId,
        name: nameOf(userId),
      })),
    }),
  ]);
}

/** Комнату удалили: её партии уходят вместе с ней, места — каскадом. */
export async function dropRoomMatches(roomKey: string): Promise<void> {
  await prisma.turboMatch.deleteMany({ where: { roomKey } });
}

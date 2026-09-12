import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isBot } from "../bots/seat";
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
 *
 * Боты в таблицу мест не идут: у места внешний ключ на живого пользователя, а
 * учётной записи у бота нет и заводить её незачем. Кто из мест был программой,
 * лежит в самой партии полем `bots` — с характером, уровнем и ником.
 */
export async function saveMatch(draft: MatchDraft): Promise<void> {
  const human = draft.seats.filter((id) => !isBot(id));
  const people = await prisma.user.findMany({
    where: { id: { in: human } },
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
    // Простые поля, но Prisma для колонки JSON хочет свой тип: наш — тот же
    // набор строк и чисел, и разъехаться им негде.
    bots: draft.bots.map((bot) => ({ ...bot })) as Prisma.InputJsonValue,
  };

  await prisma.$transaction([
    prisma.turboMatch.upsert({
      where: { id: draft.id },
      create: { id: draft.id, ...data },
      update: data,
    }),
    prisma.turboMatchSeat.deleteMany({ where: { matchId: draft.id } }),
    prisma.turboMatchSeat.createMany({
      data: draft.seats.flatMap((userId, seat) =>
        isBot(userId)
          ? []
          : [{ matchId: draft.id, seat, userId, name: nameOf(userId) }],
      ),
    }),
  ]);
}

/** Комнату удалили: её партии уходят вместе с ней, места — каскадом. */
export async function dropRoomMatches(roomKey: string): Promise<void> {
  await prisma.turboMatch.deleteMany({ where: { roomKey } });
}

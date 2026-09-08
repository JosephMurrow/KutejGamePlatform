import {
  TOP_SIZE,
  type Leaderboard,
  type LeaderboardPeriod,
  type LeaderboardRow,
} from "@/shared/leaderboard";
import { GLOBAL_ROOM } from "@/games/pricetitute/protocol";
import { prisma } from "@/lib/prisma";

export {
  TOP_SIZE,
  type Leaderboard,
  type LeaderboardPeriod,
  type LeaderboardRow,
};

/**
 * Рейтинг общей комнаты (см. src/games/pricetitute/docs/SPEC.md §8). Очки приватных комнат сюда не
 * попадают: они лежат в базе под своим ключом комнаты.
 *
 * За всё время счёт берётся из накопленной таблицы Score, за неделю —
 * пересчитывается по раундам, иначе пришлось бы держать отдельный счётчик на
 * каждый период.
 *
 * Боты из режима «Forever alone» отсекаются явно. Сейчас они и так не могут
 * попасть сюда — играют только в приватных комнатах, — но рейтинг не должен
 * зависеть от этого совпадения: стоит однажды пустить бота в общую комнату,
 * и он окажется в таблице.
 */

/** Только живые игроки: боты в зачёт не идут. */
/**
 * Кого показываем в общем рейтинге. Гостевые очки живут под ключом своей
 * комнаты и сюда не дотянулись бы и так, но одна забытая выборка — и
 * одноразовый ник окажется в общей таблице.
 */
const HUMAN = { isBot: false, isGuest: false } as const;

export async function loadLeaderboard(
  period: LeaderboardPeriod,
  viewerId: string,
): Promise<Leaderboard> {
  return period === "week" ? loadWeek(viewerId) : loadAllTime(viewerId);
}

/**
 * Порядок: больше очков выше; при равных очках выше тот, кому хватило меньше
 * раундов — точность ценнее усидчивости.
 */
function compare(a: LeaderboardRow, b: LeaderboardRow): number {
  if (b.points !== a.points) return b.points - a.points;
  if (a.roundsPlayed !== b.roundsPlayed) return a.roundsPlayed - b.roundsPlayed;
  return a.nickname.localeCompare(b.nickname, "ru");
}

async function loadAllTime(viewerId: string): Promise<Leaderboard> {
  const [scores, total] = await Promise.all([
    prisma.score.findMany({
      where: { roomKey: GLOBAL_ROOM, roundsPlayed: { gt: 0 }, user: HUMAN },
      orderBy: [{ points: "desc" }, { roundsPlayed: "asc" }],
      take: TOP_SIZE,
      select: {
        userId: true,
        points: true,
        roundsPlayed: true,
        user: { select: { nickname: true, avatarId: true } },
      },
    }),
    prisma.score.count({
      where: { roomKey: GLOBAL_ROOM, roundsPlayed: { gt: 0 }, user: HUMAN },
    }),
  ]);

  const rows: LeaderboardRow[] = scores.map((score, index) => ({
    rank: index + 1,
    userId: score.userId,
    nickname: score.user.nickname,
    avatarId: score.user.avatarId,
    points: score.points,
    roundsPlayed: score.roundsPlayed,
  }));

  return {
    period: "all",
    rows,
    you: await ownRow(rows, viewerId, async () => {
      const mine = await prisma.score.findUnique({
        where: { userId_roomKey: { userId: viewerId, roomKey: GLOBAL_ROOM } },
        select: {
          points: true,
          roundsPlayed: true,
          user: { select: { nickname: true, avatarId: true } },
        },
      });
      if (!mine || mine.roundsPlayed === 0) return null;

      // Выше меня те, у кого больше очков, и те, кто набрал столько же быстрее.
      const ahead = await prisma.score.count({
        where: {
          roomKey: GLOBAL_ROOM,
          roundsPlayed: { gt: 0 },
          user: HUMAN,
          OR: [
            { points: { gt: mine.points } },
            {
              points: mine.points,
              roundsPlayed: { lt: mine.roundsPlayed },
            },
          ],
        },
      });

      return {
        rank: ahead + 1,
        userId: viewerId,
        nickname: mine.user.nickname,
        avatarId: mine.user.avatarId,
        points: mine.points,
        roundsPlayed: mine.roundsPlayed,
      };
    }),
    total,
    since: null,
  };
}

async function loadWeek(viewerId: string): Promise<Leaderboard> {
  const since = startOfWeek(new Date());
  const inWeek = { roomKey: GLOBAL_ROOM, finishedAt: { gte: since } };

  const [wins, bets, hosted] = await Promise.all([
    prisma.roundBet.groupBy({
      by: ["playerId"],
      where: { won: true, round: inWeek, player: HUMAN },
      _count: { _all: true },
    }),
    prisma.roundBet.groupBy({
      by: ["playerId"],
      where: { round: inWeek, player: HUMAN },
      _count: { _all: true },
    }),
    prisma.round.groupBy({
      by: ["hostId"],
      where: { ...inWeek, host: HUMAN },
      _count: { _all: true },
    }),
  ]);

  const tally = new Map<string, { points: number; roundsPlayed: number }>();
  const bump = (
    id: string,
    field: "points" | "roundsPlayed",
    amount: number,
  ) => {
    const entry = tally.get(id) ?? { points: 0, roundsPlayed: 0 };
    entry[field] += amount;
    tally.set(id, entry);
  };

  for (const row of wins) bump(row.playerId, "points", row._count._all);
  for (const row of bets) bump(row.playerId, "roundsPlayed", row._count._all);
  for (const row of hosted) bump(row.hostId, "roundsPlayed", row._count._all);

  const profiles = await profilesFor([...tally.keys()]);

  const ranked = [...tally.entries()]
    .map(([userId, stats]) => ({
      rank: 0,
      userId,
      nickname: profiles.get(userId)?.nickname ?? "Игрок",
      avatarId: profiles.get(userId)?.avatarId ?? 0,
      points: stats.points,
      roundsPlayed: stats.roundsPlayed,
    }))
    .sort(compare)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const rows = ranked.slice(0, TOP_SIZE);
  const mine = ranked.find((row) => row.userId === viewerId) ?? null;

  return {
    period: "week",
    rows,
    you: rows.some((row) => row.userId === viewerId) ? null : mine,
    total: ranked.length,
    since,
  };
}

async function ownRow(
  rows: LeaderboardRow[],
  viewerId: string,
  fallback: () => Promise<LeaderboardRow | null>,
): Promise<LeaderboardRow | null> {
  if (rows.some((row) => row.userId === viewerId)) return null;
  return fallback();
}

async function profilesFor(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, { nickname: string; avatarId: number }>();
  }

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, nickname: true, avatarId: true },
  });

  return new Map(
    users.map((user) => [
      user.id,
      { nickname: user.nickname, avatarId: user.avatarId },
    ]),
  );
}

/** Понедельник текущей недели, полночь по времени сервера. */
export function startOfWeek(now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const shift = (start.getDay() + 6) % 7; // понедельник — ноль
  start.setDate(start.getDate() - shift);

  return start;
}

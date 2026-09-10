import { prisma } from "@/lib/prisma";
import type { ChessResult, EndReason } from "../engine/outcome";
import { inLobby } from "../protocol";
import type { BotLevelDb } from "../rooms/settings";
import { bonusFor, counts, RATED_PLIES, REAL_GAME_PLIES } from "./bonus";
import { fresh, rate, type Opponent, type Rating, type Score } from "./glicko";

/**
 * Что партия делает с рейтингом.
 *
 * Две шкалы, и защищены они по-разному. Рейтинг зала защищён тем, что
 * приватные партии в него вообще не попадают. Суммарный — потолком в единицу за
 * победу, таянием надбавки на повторах и требованием, чтобы победа была матом
 * или сдачей в состоявшейся партии (src/games/chess/docs/BACKLOG.md E3).
 *
 * Партии с ботами не делают ничего, кроме счётчика побед над ботами: иначе
 * вечер против лёгкого уровня стоит сотни партий с людьми.
 */

/** Сколько рейтинговых партий засчитывается между одними и теми же за сутки. */
export const DAILY_LIMIT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Finished {
  roomKey: string;
  whiteId: string;
  blackId: string;
  result: ChessResult;
  reason: EndReason;
  /** Сколько полуходов сделано. */
  plies: number;
  /** Идентификатор бота, если играли с ним. Его в базе нет. */
  botId: string | null;
  /** Уровень бота: по нему считаются победы над «экспертом». */
  botLevel?: BotLevelDb;
  endedAt?: Date;
}

/** Разнести партию по рейтингам. */
export async function applyMatch(match: Finished): Promise<void> {
  if (match.botId) return botGame(match);

  const now = match.endedAt ?? new Date();
  const [white, black] = await Promise.all([
    load(match.whiteId, now),
    load(match.blackId, now),
  ]);

  // Гость шахматам не соперник, и в шахматах его быть не должно вовсе. Но
  // одна забытая выборка — и одноразовый ник окажется в общей таблице.
  if (!white || !black) return;

  const played = await pairGames(match.whiteId, match.blackId);
  const rated =
    inLobby(match.roomKey) &&
    match.plies >= RATED_PLIES &&
    (await underDailyLimit(match, now));

  const scores = scoreOf(match.result);
  const next = rated
    ? {
        white: rate(
          white,
          [{ opponent: seen(black), score: scores.white }],
          now,
        ),
        black: rate(
          black,
          [{ opponent: seen(white), score: scores.black }],
          now,
        ),
      }
    : null;

  // Надбавку получает победитель, и только за мат или сдачу в состоявшейся
  // партии. Считается она по числу партий **до** этой: сегодняшняя ещё не
  // должна удешевлять сама себя.
  const winner =
    match.result === "white"
      ? match.whiteId
      : match.result === "black"
        ? match.blackId
        : null;
  const bonus =
    winner && counts({ reason: match.reason, plies: match.plies, human: true })
      ? bonusFor(played)
      : 0;

  await prisma.$transaction([
    save(
      match.whiteId,
      next?.white,
      bonus > 0 && winner === match.whiteId ? bonus : 0,
    ),
    save(
      match.blackId,
      next?.black,
      bonus > 0 && winner === match.blackId ? bonus : 0,
    ),
    bumpPair(match.whiteId, match.blackId),
  ]);
}

/**
 * Партия с ботом: рейтинг не трогает.
 *
 * Считаются только победы. Отдельно — победы над «экспертом»: на десятой
 * открывается Магнус, и открывается он этому аккаунту, а не всем
 * (src/games/chess/docs/BACKLOG.md D3).
 */
async function botGame(match: Finished): Promise<void> {
  const humanId = match.botId === match.whiteId ? match.blackId : match.whiteId;
  const won =
    (match.result === "white" && humanId === match.whiteId) ||
    (match.result === "black" && humanId === match.blackId);
  if (!won) return;

  // Победа над экспертом — мат или упавший у него флаг в состоявшейся партии.
  // Победы над другими уровнями и ничьи не считаются вовсе: на десятой такой
  // открывается Магнус (src/games/chess/docs/BACKLOG.md D3).
  const expert =
    match.botLevel === "EXPERT" &&
    match.plies >= REAL_GAME_PLIES &&
    (match.reason === "checkmate" || match.reason === "flag");

  await prisma.chessRating.upsert({
    where: { userId: humanId },
    create: { userId: humanId, botWins: 1, expertWins: expert ? 1 : 0 },
    update: {
      botWins: { increment: 1 },
      ...(expert ? { expertWins: { increment: 1 } } : {}),
    },
  });
}

/** Рейтинг игрока; `null` — такого игрока в зачёте нет. */
async function load(userId: string, now: Date): Promise<Rating | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isBot: true,
      isGuest: true,
      chessRating: {
        select: {
          rating: true,
          deviation: true,
          volatility: true,
          ratedAt: true,
        },
      },
    },
  });

  if (!user || user.isBot || user.isGuest) return null;

  return user.chessRating ?? fresh(now);
}

/** Соперник глазами счёта. */
function seen(rating: Rating): Opponent {
  return { rating: rating.rating, deviation: rating.deviation };
}

function scoreOf(result: ChessResult): { white: Score; black: Score } {
  if (result === "white") return { white: 1, black: 0 };
  if (result === "black") return { white: 0, black: 1 };

  return { white: 0.5, black: 0.5 };
}

/** Сколько партий эта пара сыграла до сегодняшней. */
async function pairGames(a: string, b: string): Promise<number> {
  const [lowId, highId] = order(a, b);
  const pair = await prisma.chessPair.findUnique({
    where: { lowId_highId: { lowId, highId } },
    select: { games: true },
  });

  return pair?.games ?? 0;
}

/**
 * Не слишком ли часто эти двое играют друг с другом.
 *
 * Считается по записанным партиям зала: приватные и так рейтинг не меняют.
 */
async function underDailyLimit(match: Finished, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - DAY_MS);
  const played = await prisma.chessMatch.count({
    where: {
      endedAt: { gte: since },
      OR: [
        { whiteId: match.whiteId, blackId: match.blackId },
        { whiteId: match.blackId, blackId: match.whiteId },
      ],
    },
  });

  // Сегодняшняя партия уже записана, поэтому предел сравнивается с ней вместе.
  return played <= DAILY_LIMIT;
}

/** Записать новый рейтинг и надбавку. Партия считается всегда. */
function save(userId: string, rating: Rating | undefined, bonus: number) {
  const counted = { games: { increment: 1 }, bonus: { increment: bonus } };

  return prisma.chessRating.upsert({
    where: { userId },
    create: {
      userId,
      games: 1,
      bonus,
      ...(rating
        ? {
            rating: rating.rating,
            deviation: rating.deviation,
            volatility: rating.volatility,
            ratedAt: rating.ratedAt,
          }
        : {}),
    },
    update: rating
      ? {
          ...counted,
          rating: rating.rating,
          deviation: rating.deviation,
          volatility: rating.volatility,
          ratedAt: rating.ratedAt,
        }
      : counted,
  });
}

function bumpPair(a: string, b: string) {
  const [lowId, highId] = order(a, b);

  return prisma.chessPair.upsert({
    where: { lowId_highId: { lowId, highId } },
    create: { lowId, highId, games: 1 },
    update: { games: { increment: 1 } },
  });
}

/** Пара хранится одной строкой: «сколько мы сыграли» — вопрос без стороны. */
function order(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

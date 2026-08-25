/**
 * Формы данных рейтинга. Живут в `shared`, а не рядом с запросами к базе:
 * таблицу рисует и серверная страница, и клиентское окно поверх комнаты, а
 * импорт из `lib/leaderboard.ts` утащил бы в браузерный бандл весь Prisma.
 */

export type LeaderboardPeriod = "all" | "week";

export const TOP_SIZE = 100;

export interface LeaderboardRow {
  rank: number;
  userId: string;
  nickname: string;
  avatarId: number;
  points: number;
  roundsPlayed: number;
}

export interface Leaderboard {
  period: LeaderboardPeriod;
  rows: LeaderboardRow[];
  /** Строка игрока, если он не попал в топ. */
  you: LeaderboardRow | null;
  /** Сколько всего игроков в зачёте. */
  total: number;
  /** Начало недели, для подписи. */
  since: Date | null;
}

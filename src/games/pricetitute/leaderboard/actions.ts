"use server";

import { getSessionUserId } from "@/lib/auth/session";
import { loadChampions } from "./champions";
import {
  loadLeaderboard,
  type Leaderboard,
  type LeaderboardPeriod,
} from "./board";

export interface LeaderboardView {
  board: Leaderboard;
  viewerId: string;
  allTimeChampionId: string | null;
  weekChampionId: string | null;
}

/**
 * Рейтинг для окна поверх комнаты.
 *
 * Отдельный экшен вместо API-роута: роутов в проекте нет ни одного, и заводить
 * ради одного окна целый слой незачем.
 *
 * Наружу отдаются только простые значения — набор корон собирается на клиенте.
 */
export async function fetchLeaderboard(
  period: LeaderboardPeriod,
): Promise<LeaderboardView | null> {
  const viewerId = await getSessionUserId();
  if (!viewerId) return null;

  const [board, champs] = await Promise.all([
    loadLeaderboard(period, viewerId),
    loadChampions(),
  ]);

  return {
    board,
    viewerId,
    allTimeChampionId: champs.allTime,
    weekChampionId: champs.week,
  };
}

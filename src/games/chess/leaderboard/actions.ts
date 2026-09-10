"use server";

import { getSessionUserId } from "@/lib/auth/session";
import { loadBoard } from "./board";
import type { BoardView } from "./shape";

/**
 * Таблица рейтинга для окна поверх комнаты.
 *
 * Экшен, а не роут: роутов в проекте нет ни одного, и заводить ради одного
 * окна целый слой незачем — так же сделано у платитутки.
 */
export async function fetchBoard(): Promise<BoardView | null> {
  const viewerId = await getSessionUserId();
  if (!viewerId) return null;

  return { board: await loadBoard(viewerId), viewerId };
}

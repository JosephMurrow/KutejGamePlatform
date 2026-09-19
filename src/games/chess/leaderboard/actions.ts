"use server";

import { sessionCaller } from "@/lib/auth/session";
import { loadBoard } from "./board";
import type { BoardView } from "./shape";

/**
 * Таблица рейтинга для окна поверх комнаты.
 *
 * Экшен, а не роут: роутов в проекте нет ни одного, и заводить ради одного
 * окна целый слой незачем — так же сделано у платитутки.
 */
export async function fetchBoard(): Promise<BoardView | null> {
  // Гостю читать рейтинг можно: это ники и очки, ничего не меняется. Окно
  // рейтинга в комнате ему уже показывают, и отказ повесил бы его на
  // «Загружаем…» (docs/SECURITY.md, S-C1).
  const caller = await sessionCaller();
  if (!caller) return null;
  const viewerId = caller.id;

  return { board: await loadBoard(viewerId), viewerId };
}

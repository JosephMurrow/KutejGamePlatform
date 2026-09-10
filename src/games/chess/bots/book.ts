import { prisma } from "@/lib/prisma";
import type { BotLevelDb } from "../rooms/settings";

/**
 * Дебютная книга: ход из репертуара уровня, если позиция в нём есть.
 *
 * Книга маленькая и меняется только сидом, поэтому читается один раз и живёт в
 * памяти процесса. Ходить в базу на каждый ход бота незачем.
 */

/** Ключ — уровень и хеш позиции; значение — ходы, какие книга знает. */
let cache: Map<string, string[]> | null = null;

function key(level: BotLevelDb, position: string): string {
  return `${level}:${position}`;
}

async function load(): Promise<Map<string, string[]>> {
  if (cache) return cache;

  const rows = await prisma.chessOpening.findMany({
    select: { level: true, position: true, move: true },
  });

  const map = new Map<string, string[]>();
  for (const row of rows) {
    const at = key(row.level, row.position);
    map.set(at, [...(map.get(at) ?? []), row.move]);
  }

  cache = map;
  return map;
}

/**
 * Что играть из этой позиции по книге.
 *
 * `null` — позиции в репертуаре нет, дальше думает движок. Если книга знает
 * несколько продолжений, выбирается случайное: иначе бот играет одну и ту же
 * партию до двадцатого хода.
 */
export async function bookMove(
  level: BotLevelDb,
  position: string,
  random: () => number = Math.random,
): Promise<string | null> {
  const book = await load();
  const moves = book.get(key(level, position));
  if (!moves || moves.length === 0) return null;

  return moves[Math.floor(random() * moves.length)] ?? null;
}

/** Забыть загруженное — нужно после пересева книги. */
export function forgetBook(): void {
  cache = null;
}

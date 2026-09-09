import { Chess } from "chess.js";
import { prisma } from "@/lib/prisma";
import type { BotLevelDb } from "../rooms/settings";
import { REPERTOIRE } from "./repertoire";

/**
 * Сид шахмат: дебютный репертуар ботов.
 *
 * Линии записаны нотацией, а в базу уезжают позициями: ключ — хеш позиции,
 * значение — ход из неё. Так книга находится независимо от порядка ходов,
 * которым до этой позиции дошли (src/games/chess/docs/BACKLOG.md D2).
 *
 * Идемпотентен: два прогона подряд дают ту же книгу, а не вдвое большую.
 */

export interface Entry {
  level: BotLevelDb;
  position: string;
  move: string;
}

/** Развернуть линии в позиции с ходами. */
export function unfold(): Entry[] {
  const seen = new Set<string>();
  const entries: Entry[] = [];

  for (const [level, lines] of Object.entries(REPERTOIRE)) {
    for (const line of lines) {
      const board = new Chess();

      for (const san of line.split(" ")) {
        const position = board.hash();
        let made;
        try {
          made = board.move(san);
        } catch {
          // Битая линия не должна ронять сид: пропускаем её и идём дальше.
          console.error(`[chess] в репертуаре ${level} не сыграть ${san}`);
          break;
        }

        const move = `${made.from}${made.to}${made.promotion ?? ""}`;
        const key = `${level}:${position}:${move}`;
        if (seen.has(key)) continue;

        seen.add(key);
        entries.push({ level: level as BotLevelDb, position, move });
      }
    }
  }

  return entries;
}

export async function seedChess(): Promise<void> {
  const entries = unfold();

  await prisma.chessOpening.createMany({ data: entries, skipDuplicates: true });

  console.log(`Шахматы: дебютная книга — ${entries.length} позиций`);
}

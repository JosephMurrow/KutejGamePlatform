import { prisma } from "@/lib/prisma";
import type { ChessResult } from "../engine/outcome";
import type { TimeControl } from "./settings";

/**
 * Сыгранные партии: запись и чтение.
 *
 * Партия хранится списком ходов и временем на каждый, а не позициями: из ходов
 * позиция восстанавливается, обратно — нет (src/games/chess/docs/BACKLOG.md G).
 */

/** Стартовый рейтинг. Настоящий счёт придёт своим этапом. */
export const START_RATING = 1500;

export interface MatchRecord {
  /** Постоянный на всю партию: по нему запись обновляется, а не плодится. */
  id: string;
  roomKey: string;
  whiteId: string;
  blackId: string;
  /** Ходы записью, по порядку. */
  moves: string[];
  /** Сколько думали над каждым ходом, мс. */
  times: number[];
  result: ChessResult;
  reason: string;
  timeControl: TimeControl;
  startedAt: Date;
}

const RESULT_DB = {
  white: "WHITE",
  black: "BLACK",
  draw: "DRAW",
} as const;

/**
 * Записать партию.
 *
 * Ники и рейтинги берутся здесь и запоминаются навсегда: человек сменит ник, а
 * история партии от этого меняться не должна.
 */
export async function saveMatch(record: MatchRecord): Promise<void> {
  const players = await prisma.user.findMany({
    where: { id: { in: [record.whiteId, record.blackId] } },
    select: { id: true, nickname: true },
  });
  const nameOf = (id: string) =>
    players.find((player) => player.id === id)?.nickname ?? "—";

  const data = {
    roomKey: record.roomKey,
    whiteId: record.whiteId,
    blackId: record.blackId,
    whiteName: nameOf(record.whiteId),
    blackName: nameOf(record.blackId),
    whiteRating: START_RATING,
    blackRating: START_RATING,
    moves: record.moves,
    times: record.times,
    result: RESULT_DB[record.result],
    reason: record.reason,
    timeControl: record.timeControl,
    startedAt: record.startedAt,
    endedAt: new Date(),
  };

  await prisma.chessMatch.upsert({
    where: { id: record.id },
    create: { id: record.id, ...data },
    update: data,
  });
}

/** Партии этой комнаты, свежие сверху. */
export async function roomMatches(roomKey: string, take = 20) {
  return prisma.chessMatch.findMany({
    where: { roomKey },
    orderBy: { endedAt: "desc" },
    take,
  });
}

/** Комнату удалили: её партии уходят вместе с ней. */
export async function dropRoomMatches(roomKey: string): Promise<void> {
  await prisma.chessMatch.deleteMany({ where: { roomKey } });
}

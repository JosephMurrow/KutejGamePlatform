import { prisma } from "@/lib/prisma";
import type { ChessResult, EndReason } from "../engine/outcome";
import { START_RATING } from "../rating/glicko";
import type { TimeControl } from "./settings";

/**
 * Сыгранные партии: запись и чтение.
 *
 * Партия хранится списком ходов и временем на каждый, а не позициями: из ходов
 * позиция восстанавливается, обратно — нет (src/games/chess/docs/BACKLOG.md G).
 */

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
  reason: EndReason;
  timeControl: TimeControl;
  startedAt: Date;
  /** Кто из двоих бот, если играли с ним. */
  botId: string | null;
}

const RESULT_DB = {
  white: "WHITE",
  black: "BLACK",
  draw: "DRAW",
} as const;

/**
 * Записать партию.
 *
 * Ники и рейтинги берутся здесь и запоминаются навсегда: человек сменит ник и
 * вырастет в рейтинге, а история партии от этого меняться не должна. Рейтинг
 * пишется до пересчёта — тот, с которым садились за доску.
 *
 * Партии с ботом не записываются: обе стороны в этой таблице — люди из
 * `platform.users`, а бота там нет. Историю партий с ботом заведём, если
 * понадобится просмотр таких партий (src/games/chess/docs/PLAN.md, этап 12).
 */
export async function saveMatch(record: MatchRecord): Promise<void> {
  if (record.botId) return;

  const players = await prisma.user.findMany({
    where: { id: { in: [record.whiteId, record.blackId] } },
    select: {
      id: true,
      nickname: true,
      chessRating: { select: { rating: true } },
    },
  });
  const found = (id: string) => players.find((player) => player.id === id);
  const nameOf = (id: string) => found(id)?.nickname ?? "—";
  const ratingOf = (id: string) =>
    Math.round(found(id)?.chessRating?.rating ?? START_RATING);

  const data = {
    roomKey: record.roomKey,
    whiteId: record.whiteId,
    blackId: record.blackId,
    whiteName: nameOf(record.whiteId),
    blackName: nameOf(record.blackId),
    whiteRating: ratingOf(record.whiteId),
    blackRating: ratingOf(record.blackId),
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

import { prisma } from "@/lib/prisma";
import { defaultRoomSettings, type ChessRoomSettings } from "./settings";

/**
 * Настройки партии в приватной комнате: чтение, запись и уборка.
 *
 * Лежат в схеме игры, а не колонками в platform.private_rooms: платформа не
 * знает, какие у игры настройки, и хранить их у себя не может
 * (docs/DATABASE.md, src/games/chess/docs/BACKLOG.md A4).
 */

export async function saveRoomSettings(
  roomId: string,
  settings: ChessRoomSettings,
): Promise<void> {
  await prisma.chessRoomSettings.upsert({
    where: { roomId },
    create: { roomId, ...settings },
    update: settings,
  });
}

/**
 * Настройки комнаты. Строки может не быть — комнату могли завести до того, как
 * игра научилась их писать, — тогда играем умолчанием.
 */
export async function loadRoomSettings(
  roomId: string,
): Promise<ChessRoomSettings> {
  const row = await prisma.chessRoomSettings.findUnique({ where: { roomId } });
  if (!row) return defaultRoomSettings();

  return {
    timeControl: row.timeControl,
    opponent: row.opponent,
    streamerMode: row.streamerMode,
    botLevel: row.botLevel,
    viewerDelay: row.viewerDelay,
  };
}

/** Комнату удалили: своя строка уходит вместе с ней. */
export async function dropRoomSettings(roomId: string): Promise<void> {
  await prisma.chessRoomSettings.deleteMany({ where: { roomId } });
}

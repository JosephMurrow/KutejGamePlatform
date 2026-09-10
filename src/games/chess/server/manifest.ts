import type { GameServerManifest } from "@/lib/games/engine";
import type { PrivateRoomInfo } from "@/lib/rooms/private";
import { GAME_EVENT, GAME_ID, GLOBAL_ROOM } from "../protocol";
import {
  normalizeRoomSettings,
  type ChessRoomSettings,
} from "../rooms/settings";
import {
  dropRoomSettings,
  loadRoomSettings,
  saveRoomSettings,
} from "../rooms/store";
import { dropRoomMatches } from "../rooms/matches";
import { magnusUnlocked } from "../rating/read";
import { prisma } from "@/lib/prisma";
import { createChessServer } from ".";

/**
 * Настройки общего зала. Полминуты на ход, живой соперник, без режима
 * стримера — зал не настраивается никем (src/games/chess/docs/BACKLOG.md C3).
 */
const COMMON_SETTINGS: ChessRoomSettings = {
  timeControl: "SEC_30",
  opponent: "HUMAN",
  streamerMode: false,
  botLevel: "NORMAL",
  viewerDelay: "NONE",
};

/** Серверная половина договора шахмат с платформой. */
export const CHESS_SERVER: GameServerManifest = {
  id: GAME_ID,
  commonRoomKey: GLOBAL_ROOM,
  commonRoomSettings: COMMON_SETTINGS,

  loadRoomSettings(room: PrivateRoomInfo): Promise<ChessRoomSettings> {
    return loadRoomSettings(room.id);
  },

  async saveRoomSettings(roomId: string, form: FormData): Promise<void> {
    const settings = normalizeRoomSettings({
      timeControl: form.get("timeControl"),
      opponent: form.get("opponent"),
      streamerMode: form.get("streamerMode"),
      botLevel: form.get("botLevel"),
      viewerDelay: form.get("viewerDelay"),
    });

    await saveRoomSettings(roomId, {
      ...settings,
      botLevel: await allowedLevel(roomId, settings.botLevel),
    });
  },

  actions: Object.values(GAME_EVENT),

  async dropRoomData(key: string): Promise<void> {
    // Комнату удалили — уходят и настройки, и сыгранные в ней партии.
    await dropRoomSettings(key);
    await dropRoomMatches(key);
  },

  createServer: createChessServer,
};

/**
 * Уровень, который этому хозяину действительно можно.
 *
 * Форма скрывает Магнуса от тех, кто его не открыл, но форма приходит от
 * клиента, а ему верить нельзя ни в одном поле. Неоткрытый Магнус тихо
 * превращается в эксперта — того, кого и надо было обыграть
 * (src/games/chess/docs/BACKLOG.md D3).
 */
async function allowedLevel(
  roomId: string,
  wanted: ChessRoomSettings["botLevel"],
): Promise<ChessRoomSettings["botLevel"]> {
  if (wanted !== "MAGNUS") return wanted;

  const room = await prisma.privateRoom.findUnique({
    where: { id: roomId },
    select: { hostId: true },
  });
  if (!room) return "EXPERT";

  return (await magnusUnlocked(room.hostId)) ? "MAGNUS" : "EXPERT";
}

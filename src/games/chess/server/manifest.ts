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
    await saveRoomSettings(
      roomId,
      normalizeRoomSettings({
        timeControl: form.get("timeControl"),
        opponent: form.get("opponent"),
        streamerMode: form.get("streamerMode"),
        botLevel: form.get("botLevel"),
      }),
    );
  },

  actions: Object.values(GAME_EVENT),

  async dropRoomData(key: string): Promise<void> {
    // Комнату удалили — уходят и настройки, и сыгранные в ней партии.
    await dropRoomSettings(key);
    await dropRoomMatches(key);
  },

  createServer: createChessServer,
};

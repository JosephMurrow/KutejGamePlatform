import type { GameServerManifest } from "@/lib/games/engine";
import type { PrivateRoomInfo } from "@/lib/rooms/private";
import { GAME_EVENT, GAME_ID, GLOBAL_ROOM } from "../protocol";
import {
  normalizeRoomSettings,
  type TurboRoomSettings,
} from "../rooms/settings";
import {
  dropRoomSettings,
  loadRoomSettings,
  saveRoomSettings,
} from "../rooms/store";
import { createTurboServer } from ".";

/** Серверная половина договора турбо-шахмат с платформой. */
export const TURBOCHESS_SERVER: GameServerManifest = {
  id: GAME_ID,
  commonRoomKey: GLOBAL_ROOM,
  // Общего зала нет, за его ключом закрытая дверь (server/hall.ts) — ей
  // настройки ни к чему.
  commonRoomSettings: null,

  loadRoomSettings(room: PrivateRoomInfo): Promise<TurboRoomSettings> {
    return loadRoomSettings(room.id);
  },

  async saveRoomSettings(roomId: string, form: FormData): Promise<void> {
    await saveRoomSettings(
      roomId,
      normalizeRoomSettings({ mode: form.get("mode") }),
    );
  },

  actions: Object.values(GAME_EVENT),

  async dropRoomData(key: string): Promise<void> {
    // Комнату удалили — уходят и её настройки. Партий в базе пока нет.
    await dropRoomSettings(key);
  },

  createServer: createTurboServer,
};

import type { GameServerManifest } from "@/lib/games/engine";
import type { PrivateRoomInfo } from "@/lib/rooms/private";
import { dropScores } from "../engine/store";
import { GAME_EVENT, GAME_ID, GLOBAL_ROOM } from "../protocol";
import { dropQuestionQueue } from "../questions/store";
import {
  dropRoomSettings,
  loadRoomSettings,
  normalizeRoomSettings,
  saveRoomSettings,
} from "../rooms/store";
import { parseKind } from "@/shared/room-settings";
import { createPricetituteServer } from ".";
import type { PricetituteSettings } from "./room";

/**
 * Настройки общего зала. Он играет «Обычным» и настройке не подлежит: пьянка,
 * секс, криминал и чернота живут только в приватных комнатах.
 */
const COMMON_SETTINGS: PricetituteSettings = {
  pool: { includeAdult: true, mode: "normal" },
  rules: {},
};

/** Серверная половина договора платитутки с платформой. */
export const PRICETITUTE_SERVER: GameServerManifest = {
  id: GAME_ID,
  commonRoomKey: GLOBAL_ROOM,
  commonRoomSettings: COMMON_SETTINGS,

  async loadRoomSettings(room: PrivateRoomInfo): Promise<PricetituteSettings> {
    const settings = await loadRoomSettings(room.id, room.kind);

    return {
      pool: { includeAdult: settings.includeAdult, mode: settings.mode },
      rules: {
        timings: {
          bettingMs: settings.bettingMs,
          revealMs: settings.revealMs,
        },
        endMode: settings.endMode,
        endValue: settings.endValue,
        ownerId: room.hostId,
        hostRotation: settings.hostRotation,
      },
    };
  },

  async saveRoomSettings(roomId: string, form: FormData): Promise<void> {
    await saveRoomSettings(
      roomId,
      normalizeRoomSettings(
        {
          bettingMs: form.get("bettingMs"),
          revealMs: form.get("revealMs"),
          includeAdult: form.get("includeAdult") === "on",
          mode: form.get("mode"),
          hostRotation: form.get("hostRotation"),
          endMode: form.get("endMode"),
          endValue: form.get("endValue"),
        },
        parseKind(form.get("kind")),
      ),
    );
  },

  actions: Object.values(GAME_EVENT),

  dropRoomData: async (key) => {
    await dropRoomSettings(key);
    await dropQuestionQueue(key);
    await dropScores(key);
  },

  createServer: createPricetituteServer,
};

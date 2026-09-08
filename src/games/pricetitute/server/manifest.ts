import type { GameServerManifest } from "@/lib/games/engine";
import type { PrivateRoomInfo } from "@/lib/rooms/private";
import { dropScores } from "../engine/store";
import { GAME_ID, GAME_EVENT, GLOBAL_ROOM } from "../protocol";
import { dropQuestionQueue } from "../questions/store";
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
  roomSettings: (room: PrivateRoomInfo): PricetituteSettings => ({
    pool: { includeAdult: room.includeAdult, mode: room.mode },
    rules: {
      timings: { bettingMs: room.bettingMs, revealMs: room.revealMs },
      endMode: room.endMode,
      endValue: room.endValue,
      ownerId: room.hostId,
      hostRotation: room.hostRotation,
    },
  }),
  actions: Object.values(GAME_EVENT),
  dropRoomData: async (key) => {
    await dropQuestionQueue(key);
    await dropScores(key);
  },
  createServer: createPricetituteServer,
};

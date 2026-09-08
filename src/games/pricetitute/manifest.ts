import type { GameManifest } from "@/lib/games/manifest";
import { ROBOT_AVATAR_OFFSET, ROBOT_COUNT } from "./bots/avatars";
import { BotAvatar } from "./components/BotAvatar";
import { GLOBAL_ROOM } from "./protocol";

/**
 * Договор платитутки с платформой — клиентская половина. Серверная лежит в
 * server/manifest.ts и в браузер не едет.
 */
export const PRICETITUTE: GameManifest = {
  id: "pricetitute",
  title: "Платитутка",
  commonRoomKey: GLOBAL_ROOM,
  botAvatars: {
    offset: ROBOT_AVATAR_OFFSET,
    count: ROBOT_COUNT,
    Render: BotAvatar,
  },
};

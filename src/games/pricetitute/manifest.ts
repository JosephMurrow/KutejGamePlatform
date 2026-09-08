import type { GameManifest } from "@/lib/games/manifest";
import { ROBOT_AVATAR_OFFSET, ROBOT_COUNT } from "./bots/avatars";
import { BotAvatar } from "./components/BotAvatar";
import { GAME_ID, GLOBAL_ROOM } from "./protocol";

/** Адреса страниц игры. Отсюда их берут и витрина, и сама игра. */
export const ROUTES = {
  home: "/games/pricetitute",
  play: "/games/pricetitute/play",
  newRoom: "/games/pricetitute/rooms/new",
  leaderboard: "/games/pricetitute/leaderboard",
} as const;

/**
 * Договор платитутки с платформой — клиентская половина. Серверная лежит в
 * server/manifest.ts и в браузер не едет.
 */
export const PRICETITUTE: GameManifest = {
  id: GAME_ID,
  title: "Платитутка",
  tagline: "Угадай, за сколько человек на это согласится",
  adult: true,
  routes: ROUTES,
  commonRoomKey: GLOBAL_ROOM,
  botAvatars: {
    offset: ROBOT_AVATAR_OFFSET,
    count: ROBOT_COUNT,
    Render: BotAvatar,
  },
};

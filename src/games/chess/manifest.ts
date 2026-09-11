import type { GameManifest } from "@/lib/games/manifest";
import { BOT_AVATAR_OFFSET, BOT_COUNT, botAvatarSrc } from "./bots/avatars";
import { ChessBox } from "./components/Box";
import { GAME_ID, GLOBAL_ROOM } from "./protocol";

/** Адреса страниц игры. Отсюда их берут и витрина, и сама игра. */
export const ROUTES = {
  home: "/games/chess",
  play: "/games/chess/play",
  newRoom: "/games/chess/rooms/new",
  leaderboard: "/games/chess/leaderboard",
} as const;

/**
 * Договор шахмат с платформой — клиентская половина. Серверная лежит в
 * server/manifest.ts и в браузер не едет.
 */
export const CHESS: GameManifest = {
  id: GAME_ID,
  title: "Шахматы",
  tagline: "Величайшая война в истории, запертая на 64 клетках",
  adult: false,
  routes: ROUTES,
  themeColor: "#f4efe4",
  Box: ChessBox,
  logo: "/games/chess/logo.png",
  icon: "/games/chess/icon.png",
  commonRoomKey: GLOBAL_ROOM,
  botAvatars: {
    offset: BOT_AVATAR_OFFSET,
    count: BOT_COUNT,
    src: botAvatarSrc,
  },
};

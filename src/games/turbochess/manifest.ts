import type { GameManifest } from "@/lib/games/manifest";
import { BOT_AVATAR_OFFSET, BOT_COUNT, botAvatarSrc } from "./bots/avatars";
import { TurboChessBox } from "./components/Box";
import { GAME_ID, GLOBAL_ROOM } from "./protocol";

/** Адреса страниц игры. Отсюда их берут и витрина, и сама игра. */
export const ROUTES = {
  home: "/games/turbochess",
  // Общего зала нет: играть — значит завести свою комнату
  // (docs/BACKLOG.md C1).
  play: "/games/turbochess/rooms/new",
  newRoom: "/games/turbochess/rooms/new",
  // Таблицы пока нет (docs/BACKLOG.md G3). Поле обязательно по договору, и
  // ведёт оно туда, где про игру рассказано всё, — на её главную.
  leaderboard: "/games/turbochess",
} as const;

/**
 * Договор турбо-шахмат с платформой — клиентская половина. Серверная лежит в
 * server/manifest.ts и в браузер не едет.
 */
export const TURBOCHESS: GameManifest = {
  id: GAME_ID,
  title: "Турбо-шахматы",
  tagline: "Шестнадцать способов сломать шахматы",
  // Взрослая целиком: про выпивку здесь и алко-шахматы, и загул
  // (docs/MODES.md, режим 5).
  adult: true,
  routes: ROUTES,
  themeColor: "#fff3ea",
  Box: TurboChessBox,
  logo: "/games/turbochess/logo.png",
  icon: "/games/turbochess/icon.png",
  commonRoomKey: GLOBAL_ROOM,
  botAvatars: {
    offset: BOT_AVATAR_OFFSET,
    count: BOT_COUNT,
    src: botAvatarSrc,
  },
};

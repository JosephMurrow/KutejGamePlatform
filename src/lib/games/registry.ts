import {
  BOT_AVATAR_BASE,
  type BotAvatarPack,
  type GameManifest,
} from "./manifest";
import { PRICETITUTE } from "@/games/pricetitute/manifest";
import { CHESS } from "@/games/chess/manifest";
import { TURBOCHESS } from "@/games/turbochess/manifest";

/**
 * Реестр игр — единственное место платформы, которому позволено знать игры
 * поимённо. Все остальные платформенные модули спрашивают отсюда, а не
 * импортируют игру напрямую: это и есть исключение из правила импортов
 * (docs/BACKLOG.md A6).
 *
 * Здесь только клиентская половина манифестов. Серверная — в servers.ts.
 */
export const GAMES: readonly GameManifest[] = [PRICETITUTE, CHESS, TURBOCHESS];

export function gameById(id: string): GameManifest | null {
  return GAMES.find((game) => game.id === id) ?? null;
}

/** Чей это общий зал. */
export function gameByCommonRoomKey(key: string): GameManifest | null {
  return GAMES.find((game) => game.commonRoomKey === key) ?? null;
}

/** Служебный номер — значит бот, а не человек. */
export function isBotAvatarId(avatarId: number): boolean {
  return avatarId >= BOT_AVATAR_BASE;
}

/** Чьему набору принадлежит служебный номер. */
export function botAvatarPackFor(avatarId: number): BotAvatarPack | null {
  for (const game of GAMES) {
    const { offset, count } = game.botAvatars;
    if (avatarId >= offset && avatarId < offset + count) {
      return game.botAvatars;
    }
  }
  return null;
}

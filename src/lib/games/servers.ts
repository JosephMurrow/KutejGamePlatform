import type { GameServerManifest } from "./engine";
import { PRICETITUTE_SERVER } from "@/games/pricetitute/server/manifest";

/**
 * Реестр серверных половин игр. Отдельно от клиентского реестра: сюда тянется
 * движок со всем хвостом, и в браузер этому попадать нельзя.
 */
export const GAME_SERVERS: readonly GameServerManifest[] = [PRICETITUTE_SERVER];

export function gameServerById(id: string): GameServerManifest | null {
  return GAME_SERVERS.find((game) => game.id === id) ?? null;
}

/**
 * Игра по умолчанию. Пока игра одна, и комната не знает своей: колонка
 * `gameId` появится на следующем этапе (docs/BACKLOG.md A4).
 */
export function defaultGameServer(): GameServerManifest {
  const first = GAME_SERVERS[0];
  if (!first) throw new Error("В реестре нет ни одной игры");
  return first;
}

/** Комнату удалили: игра убирает свои следы. */
export async function dropRoomData(gameId: string, key: string): Promise<void> {
  await gameServerById(gameId)?.dropRoomData(key);
}

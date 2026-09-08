/**
 * Кто носит корону и какую.
 *
 * Титулов три: чемпион за всё время, чемпион недели, лидер комнаты. Один
 * человек может заслужить все три, но носит одну — старшую. Три значка в ряд
 * раздули бы строку списка игроков, где и так тесно.
 */

export interface Scored {
  id: string;
  score: number;
}

export type CrownKind = "alltime" | "week" | "room";

export interface Titles {
  allTimeChampionId: string | null;
  weekChampionId: string | null;
  leaders: ReadonlySet<string>;
}

/** Порядок старшинства: что выше в списке, то и надевается. */
export function crownFor(playerId: string, titles: Titles): CrownKind | null {
  if (playerId === titles.allTimeChampionId) return "alltime";
  if (playerId === titles.weekChampionId) return "week";
  if (titles.leaders.has(playerId)) return "room";
  return null;
}

/** Титулы по снимку состояния комнаты: удобнее, чем таскать три поля порознь. */
export function titlesOf(state: {
  players: readonly Scored[];
  allTimeChampionId: string | null;
  weekChampionId: string | null;
}): Titles {
  return {
    allTimeChampionId: state.allTimeChampionId,
    weekChampionId: state.weekChampionId,
    leaders: roomLeaders(state.players),
  };
}

export const CROWN_TITLES: Record<CrownKind, string> = {
  alltime: "Чемпион за всё время",
  week: "Чемпион недели",
  room: "Лидер комнаты",
};

export function roomLeaders(players: readonly Scored[]): ReadonlySet<string> {
  const best = players.reduce((top, player) => Math.max(top, player.score), 0);

  // В начале партии все на нуле — короновать некого. Нулевой лидер выглядел бы
  // насмешкой, да и корона на всех сразу ничего не сообщает.
  if (best <= 0) return new Set();

  return new Set(
    players
      .filter((player) => player.score === best)
      .map((player) => player.id),
  );
}

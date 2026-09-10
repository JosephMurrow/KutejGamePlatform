import { seedPricetitute } from "@/games/pricetitute/seed/run";
import { seedChess } from "@/games/chess/seed/run";

/**
 * Реестр сидов. Третий из четырёх реестров платформы (четвёртый — страничный,
 * `pages.ts`) — отдельно от клиентского и серверного намеренно: за сидом
 * тянутся все данные игры (у платитутки это тысяча сто вопросов), и в
 * работающем сервере им делать нечего.
 *
 * Каждая игра сеет в свою схему и отвечает за то, чтобы её сид можно было
 * запускать сколько угодно раз подряд (docs/BACKLOG.md A5).
 */
export interface GameSeed {
  id: string;
  run(): Promise<void>;
}

export const GAME_SEEDS: readonly GameSeed[] = [
  { id: "pricetitute", run: seedPricetitute },
  { id: "chess", run: seedChess },
];

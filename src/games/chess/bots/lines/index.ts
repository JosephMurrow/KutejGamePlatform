import type { Character, Lines } from "../moments";
import { PEDANT } from "./pedant";
import { BRUTE } from "./brute";
import { GRANDDAD } from "./granddad";
import { CHAMPION } from "./champion";

/**
 * Реплики всех характеров.
 *
 * Наборы лежат по файлу на характер и правятся глазами: это тексты, а не код,
 * и вычитывать их надо списком (src/games/chess/docs/PLAN.md, этап 8). Полноту
 * — что на каждый момент есть что сказать каждому — стережёт тест.
 */
export const LINES: Record<Character, Lines> = {
  pedant: PEDANT,
  brute: BRUTE,
  granddad: GRANDDAD,
  champion: CHAMPION,
};

import type { Character } from "../characters";
import type { Lines } from "../talk";
import { DRUNK } from "./drunk";

/**
 * Колоды характеров: у кого какие реплики.
 *
 * Пишутся по характеру, а не по ситуации: один характер целиком — один коммит.
 * Так голос слышно целиком и его можно забраковать до того, как написаны
 * остальные (docs/BOTS.md, «Голос и колоды»).
 *
 * Характер без колоды за стол садится и играет молча — это рабочее состояние, а
 * не поломка: реплики добавляются по одному характеру, и партия от их
 * отсутствия не ломается.
 */
export const LINES: Partial<Record<Character, Lines>> = {
  drunk: DRUNK,
};

/** Колода характера; пустая — этот пока молчит. */
export function linesOf(character: Character): Lines {
  return LINES[character] ?? {};
}

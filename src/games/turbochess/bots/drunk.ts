import type { Level } from "./levels";
import type { CharacterTraits } from "./characters";
import type { SearchLimits } from "./search";

/**
 * Выпитое портит игру.
 *
 * Решено хозяином: чем больше бот «выпил» в алко-шахматах, тем хуже он играет —
 * бот деградирует относительно своего уровня ([BOTS.md](../docs/BOTS.md), режим
 * 5). Своего счётчика у бота нет: стопки считает комната, сюда приходит число.
 *
 * Деградация не безгранична: глубина падает до единицы и останавливается, иначе
 * на десятой стопке бот перестал бы отличать ход от сдачи. А вот зевки растут
 * дальше — именно они и выглядят как выпивший человек.
 */

/** Насколько быстро портится игра: стопок на одну ступень глубины. */
const SHOTS_PER_STEP = 3;

/** Надбавка к зевку за каждую стопку. */
const SLOP_PER_SHOT = 0.05;

export interface Tipsy {
  /** Глубина перебора после выпитого. */
  depth: number;
  /** Надбавка к вероятности зевка. */
  sloppy: number;
  /** Сколько стопок учтено — для реплик и проверок. */
  shots: number;
}

/**
 * Как выпитое меняет силу.
 *
 * `drunkard` характера — множитель: Пьянчуга валится с первой стопки, физик
 * держится дольше всех. Ноль стопок ничего не меняет, и в пятнадцати режимах из
 * шестнадцати это и есть обычный случай.
 */
export function tipsy(
  level: Level,
  traits: CharacterTraits,
  drinks: number,
): Tipsy {
  const shots = Math.max(0, Math.floor(drinks)) * traits.drunkard;
  const steps = Math.floor(shots / SHOTS_PER_STEP);

  return {
    depth: Math.max(1, level.depth - steps),
    sloppy: shots * SLOP_PER_SHOT,
    shots,
  };
}

/** Потолок просмотра падает вместе с глубиной: считать незачем то, что не нужно. */
export function limitsFor(level: Level, depth: number): SearchLimits {
  const steps = Math.max(0, level.depth - depth);
  const nodes = Math.max(200, Math.round(level.nodes / Math.pow(6, steps)));

  return { depth, nodes };
}

import type { Moment } from "./moments";

/**
 * За чем бот следит сам: положение на доске и оценка движка.
 *
 * Комната рассказывает боту про правила — кто чем сходил, кто ушёл, чем всё
 * кончилось. Здесь остаётся то, чего комната не видит: перевес, стадия партии
 * и зевок соперника. Оценку знает только бот — она приходит от движка вместе с
 * ходом (src/games/chess/docs/BACKLOG.md D4).
 *
 * Состояние объявляется один раз за партию: «эндшпиль» звучит однажды, иначе
 * бот превращается в комментатора-заику. Что уже сказано, наблюдатель узнаёт от
 * того, кто говорит: реплику может проглотить пауза, и тогда момент остаётся
 * несказанным — а значит, о нём ещё можно напомнить.
 */

/** Насколько должна подскочить оценка, чтобы счесть ход соперника зевком. */
export const BLUNDER_DRIFT = 200;
/** Насколько должна просесть, чтобы признать ход соперника сильным. */
export const GOOD_DRIFT = 120;
/** Перевес в пешках, с которого партия считается выигранной или проигранной. */
export const DECISIVE_EDGE = 3;
/** Фигур на доске (без королей и пешек), с которых начинается эндшпиль. */
export const ENDGAME_PIECES = 6;
/** Полуходов, после которых партия считается затянувшейся. */
export const LONG_PLIES = 80;
/** До какого полухода партия считается дебютом. */
export const OPENING_PLIES = 8;

/** Что бот видит перед своим ходом. */
export interface Facts {
  ply: number;
  /** Позиция, из которой предстоит ходить. */
  fen: string;
  /** Бот играет белыми. */
  white: boolean;
  /** Книга ещё ведёт бота. */
  inBook: boolean;
  /**
   * Насколько изменилась оценка после хода соперника, в сотых долях пешки.
   * Плюс — соперник сделал себе хуже. `null` — сравнивать пока не с чем.
   */
  drift: number | null;
}

export class Watcher {
  /** О чём уже сказано за партию: дважды об одном не напоминаем. */
  private readonly said = new Set<Moment>();

  /**
   * О чём сказать перед своим ходом; `null` — не о чем.
   *
   * Порядок важен: зевок соперника интереснее стадии партии, а перевес
   * интереснее того, что фигур стало мало. Ничего не запоминает — сказанное
   * отмечается отдельно, и только если реплика вправду прозвучала.
   */
  before(facts: Facts): Moment | null {
    if (facts.drift !== null) {
      if (facts.drift >= BLUNDER_DRIFT) return "playerBlunder";
      if (facts.drift <= -GOOD_DRIFT) return "playerGoodMove";
    }

    const edge = materialEdge(facts.fen, facts.white);
    if (edge >= DECISIVE_EDGE && !this.said.has("winning")) return "winning";
    if (edge <= -DECISIVE_EDGE && !this.said.has("losing")) return "losing";

    if (piecesLeft(facts.fen) <= ENDGAME_PIECES && !this.said.has("endgame")) {
      return "endgame";
    }

    if (facts.ply >= LONG_PLIES && !this.said.has("longGame")) {
      return "longGame";
    }

    if (facts.inBook) {
      const early = facts.ply <= OPENING_PLIES && !this.said.has("opening");
      return early ? "opening" : null;
    }

    // Книга кончилась не на первом же ходу — значит, партия вышла из известного.
    if (facts.ply > 2 && !this.said.has("outOfBook")) return "outOfBook";

    return null;
  }

  /**
   * Бот вправду это сказал.
   *
   * Отдельно от `before` намеренно: реплику может проглотить пауза, и тогда
   * момент считается несказанным — иначе приветствие на нулевом ходу навсегда
   * съедало бы дебют на первом (src/games/chess/bots/talk.ts).
   */
  spoke(moment: Moment): void {
    this.said.add(moment);
  }

  /** Новая партия: всё объявляется заново. */
  reset(): void {
    this.said.clear();
  }
}

/** Цена фигур в пешках. Король не считается: он есть у обоих всегда. */
const WORTH: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/**
 * Перевес в пешках глазами бота: плюс — бот впереди.
 *
 * Считается по расстановке из FEN, а не через правила: тут нужна арифметика,
 * а не легальность ходов, и тащить ради неё разбор позиции незачем.
 */
export function materialEdge(fen: string, white: boolean): number {
  let mine = 0;
  let theirs = 0;

  for (const letter of fen.split(" ")[0] ?? "") {
    const worth = WORTH[letter.toLowerCase()];
    if (worth === undefined) continue;

    const isWhite = letter === letter.toUpperCase();
    if (isWhite === white) mine += worth;
    else theirs += worth;
  }

  return mine - theirs;
}

/** Сколько на доске фигур, кроме королей и пешек. */
export function piecesLeft(fen: string): number {
  let count = 0;

  for (const letter of fen.split(" ")[0] ?? "") {
    if ("nbrqNBRQ".includes(letter)) count += 1;
  }

  return count;
}

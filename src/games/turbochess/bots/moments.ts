import type { TurboMode } from "../modes/catalog";

/**
 * Моменты партии, на которые боту есть что сказать.
 *
 * Момент — это не «когда говорить», а «о чём»: комната сообщает, что случилось,
 * а говорить или молчать решает сам бот (`talk.ts`). Список разделён надвое.
 *
 * **Базовые** звучат в каждой партии и у всех режимов общие: поздоровался,
 * забрал, потерял, зевнул, выиграл. На них колода по полсотни реплик на
 * характер — решено хозяином ([BOTS.md](../docs/BOTS.md)).
 *
 * **Режимные** звучат раз-два за партию и только в своём режиме: сбросил бомбу,
 * сказал «НЕТ», купил щит, подтвердил стопку. Там хватает дюжины: колода без
 * возврата на них всё равно не кончается.
 */

export type BaseMoment =
  // — начало и течение —
  /** Сел за доску: партия начинается. */
  | "greeting"
  /** Первые ходы. */
  | "opening"
  /** Фигур на доске мало: пошёл эндшпиль. */
  | "endgame"
  /** Партия затянулась: ходов уже очень много. */
  | "longGame"

  // — ходы бота —
  /** Забрал фигуру. */
  | "botCapture"
  /** Забрал ферзя: самая дорогая добыча. */
  | "botTakesQueen"
  /** Поставил шах. */
  | "botChecks"
  /** Провёл пешку. */
  | "botPromotes"
  /** Рокировался. */
  | "botCastles"
  /** Сам сыграл плохо: осознанный зевок уровня. */
  | "botBlunder"

  // — ходы человека —
  /** У бота забрали фигуру. */
  | "botLosesPiece"
  /** У бота забрали ферзя. */
  | "botLosesQueen"
  /** Соперник зевнул: отдал фигуру ни за что. */
  | "playerBlunder"
  /** Боту объявили шах. */
  | "botInCheck"

  // — настроение —
  /** Дела идут отлично, и бот это подчёркивает. */
  | "gloat"
  /** Дела плохи, и бот ноет. */
  | "whine"
  /** Дела очень плохи: паника. */
  | "panic"
  /** Ни то ни сё, но настроение боевое. */
  | "swagger"

  // — конец —
  /** Поставил мат. */
  | "botMates"
  /** Получил мат. */
  | "botMated"
  /** Победа не матом: флаг, сдача, взрыв, последний выживший. */
  | "botWins"
  /** Поражение не матом. */
  | "botLoses"
  /** Ничья. */
  | "draw"
  /** Ещё партия. */
  | "rematch";

export type ModeMoment =
  /** Ядерные: сбросил бомбу. */
  | "bomb"
  /** Ядерные: заряд добрал до порога. */
  | "armed"
  /** Анархия: сказал «НЕТ». */
  | "veto"
  /** Анархия: «НЕТ» сказали ему. */
  | "vetoed"
  /** Последний шанс: прыгнул. */
  | "chance"
  /** Алко: подтвердил чужую стопку. */
  | "toast"
  /** Алко: выпил сам. */
  | "drink"
  /** Чёрный рынок: купил. */
  | "buy"
  /** Подкрепление и зомби: выставил фигуру. */
  | "drop"
  /** Двойной агент: пробудил чужого. */
  | "agent"
  /** Вскрываемся: расставился и готов. */
  | "ready"
  /** Вскрываемся: вскрылись. */
  | "reveal"
  /** Королевская битва: сосед выбыл. */
  | "knockout"
  /** Мега-шахматы: фигура получила мега-форму. */
  | "mega";

export type Moment = BaseMoment | ModeMoment;

export const BASE_MOMENTS: readonly BaseMoment[] = [
  "greeting",
  "opening",
  "endgame",
  "longGame",
  "botCapture",
  "botTakesQueen",
  "botChecks",
  "botPromotes",
  "botCastles",
  "botBlunder",
  "botLosesPiece",
  "botLosesQueen",
  "playerBlunder",
  "botInCheck",
  "gloat",
  "whine",
  "panic",
  "swagger",
  "botMates",
  "botMated",
  "botWins",
  "botLoses",
  "draw",
  "rematch",
];

/** В каком режиме какие моменты бывают. Вне своего режима момент не случается. */
export const MODE_MOMENTS: Partial<Record<TurboMode, readonly ModeMoment[]>> = {
  NUCLEAR: ["bomb", "armed"],
  ANARCHY: ["veto", "vetoed"],
  LAST_CHANCE: ["chance"],
  BOOZE: ["toast", "drink"],
  BLACK_MARKET: ["buy"],
  REINFORCEMENTS: ["drop"],
  ZOMBIE: ["drop"],
  DOUBLE_AGENT: ["agent"],
  SHOWDOWN: ["ready", "reveal"],
  BATTLE_ROYALE: ["knockout"],
  MEGA: ["mega"],
};

/** Сколько реплик просит момент: базовые — колодой, режимные — горстью. */
export function deckSize(moment: Moment): number {
  return (BASE_MOMENTS as readonly string[]).includes(moment) ? 50 : 12;
}

/**
 * Моменты, которые вообще могут случиться в этом режиме: базовые всегда плюс
 * свои. По этому списку проверяются колоды — чтобы у характера не оказалось
 * реплик на бомбу и молчания на мате.
 */
export function momentsOf(mode: TurboMode): Moment[] {
  return [...BASE_MOMENTS, ...(MODE_MOMENTS[mode] ?? [])];
}

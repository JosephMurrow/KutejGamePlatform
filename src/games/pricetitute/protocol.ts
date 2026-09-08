import type { PlayerPayload, RoomStatePayload } from "@/shared/protocol";
import type { Bet } from "./engine/bet";
import type { EndMode, PauseReason, Phase } from "./engine/room";

/**
 * Протокол платитутки: всё, что платформа про игру знать не обязана — фазы,
 * вопрос, ставки, вскрышка, короны, боты.
 *
 * Типы расширяют платформенные, а не заворачиваются в них: снимок на проводе
 * остаётся плоским (docs/BACKLOG.md A3).
 */

/** Код игры: им она зовётся в адресах, в базе и в реестре. */
export const GAME_ID = "pricetitute";

/** Ключ общего зала. За ним в базе лежат живые раунды и очки — не менять. */
export const GLOBAL_ROOM = "global";

/** Действия, которые понимает движок платитутки. */
export const GAME_EVENT = {
  read: "round:read",
  answer: "round:answer",
  bet: "round:bet",
  /** Хозяин закрывает ставки досрочно и открывает вскрышку. */
  closeBetting: "round:close",
  /** Хозяин начинает новую партию после финального экрана. */
  restart: "room:restart",
  /** «Forever alone»: набить комнату ботами. */
  fillBots: "room:bots",
  dismissBots: "room:bots:out",
} as const;

export interface GamePlayerPayload extends PlayerPayload {
  score: number;
  roundsPlayed: number;
  /** Поставил ли в текущем раунде. Сама ставка до вскрышки не приходит. */
  hasBet: boolean;
  isHost: boolean;
}

export interface RevealBetPayload {
  playerId: string;
  bet: Bet;
  /** Промах по логарифмической шкале; null — ставка не участвовала. */
  distance: number | null;
  won: boolean;
}

export interface RevealPayload {
  hostAnswer: Bet;
  /**
   * Ставки. На большой комнате это не все ставки, а ближайшие к ответу плюс
   * твоя собственная: двести строк подряд никто не читает, а рассылать их
   * каждому — квадрат от числа игроков.
   */
  bets: RevealBetPayload[];
  /** Сколько ставок было на самом деле. */
  betCount: number;
}

export interface GameStatePayload extends RoomStatePayload<GamePlayerPayload> {
  phase: Phase;
  hostId: string | null;
  /**
   * Текст вопроса. В фазе READY приходит только ведущему — остальные видят
   * null до того, как он нажмёт «Прочитал».
   */
  question: string | null;
  questionAdult: boolean;
  /** Заполнено только в фазе вскрышки. */
  reveal: RevealPayload | null;
  /** Почему комната стоит: только в фазе ожидания. */
  pauseReason: PauseReason | null;
  /** Победители партии: только на финальном экране. */
  winners: string[] | null;
  /** Сыграно раундов в текущей партии. */
  roundsPlayed: number;
  endMode: EndMode;
  endValue: number | null;
  /**
   * Чемпионы рейтинга общей комнаты. Приходят и в приватную: титул человек
   * заслужил вообще, а не в этой комнате, и носит его везде.
   */
  allTimeChampionId: string | null;
  weekChampionId: string | null;
  /**
   * Можно ли позвать компанию по кнопке «Forever alone»: только хозяину пустой
   * приватной комнаты. Как только заходит живой игрок, кнопка пропадает.
   */
  canInviteBots: boolean;
  /**
   * Может ли этот игрок распоряжаться ботами — звать и выгонять. Хозяин
   * приватной комнаты может это в любой момент, даже когда за столом люди.
   */
  canManageBots: boolean;
  /** Сколько ботов сейчас за столом. */
  botCount: number;
  /** Больше этого числа ботов в комнату не посадить. */
  botLimit: number;
}

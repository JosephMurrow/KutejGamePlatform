import type { Bet } from "@/lib/game/bet";
import type { EndMode, PauseReason, Phase } from "@/lib/game/room";

/**
 * Контракт сокетов: типы делят клиент и сервер, поэтому здесь не должно быть
 * ничего серверного — только описания сообщений.
 */

export const GLOBAL_ROOM = "global";

/** Путь, по которому Socket.IO принимает подключения. */
export const SOCKET_PATH = "/socket.io";

export const SERVER_EVENT = {
  /** Полный снимок комнаты: он же и есть восстановление после реконнекта. */
  state: "room:state",
  chatHistory: "chat:history",
  chatMessage: "chat:message",
  /** Причина принудительного отключения. */
  kicked: "room:kicked",
} as const;

export const CLIENT_EVENT = {
  read: "round:read",
  answer: "round:answer",
  bet: "round:bet",
  chat: "chat:send",
  /** Хозяин приватной комнаты выгоняет игрока. */
  kick: "room:kick",
  /** Хозяин начинает новую партию после финального экрана. */
  restart: "room:restart",
  /** «Forever alone»: набить комнату ботами. */
  fillBots: "room:bots",
  dismissBots: "room:bots:out",
} as const;

/** Имя параметра подключения с кодом приватной комнаты. */
export const ROOM_QUERY = "room";

export interface PlayerPayload {
  id: string;
  nickname: string;
  avatarId: number;
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
  bets: RevealBetPayload[];
}

export interface RoomStatePayload {
  roomKey: string;
  phase: Phase;
  /** Абсолютное время конца фазы, unix ms. */
  deadline: number | null;
  /** Полная длительность фазы: по ней рисуется шкала обратного отсчёта. */
  phaseDurationMs: number | null;
  /**
   * Время сервера в момент отправки. Часы клиента врут, поэтому обратный
   * отсчёт считается как deadline − serverTime, а не по локальному времени.
   */
  serverTime: number;
  hostId: string | null;
  /**
   * Текст вопроса. В фазе READY приходит только ведущему — остальные видят
   * null до того, как он нажмёт «Прочитал».
   */
  question: string | null;
  questionAdult: boolean;
  players: PlayerPayload[];
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
  /** Хозяин приватной комнаты; в общей — null. */
  ownerId: string | null;
  /**
   * Чемпионы рейтинга общей комнаты. Приходят и в приватную: титул человек
   * заслужил вообще, а не в этой комнате, и носит его везде.
   */
  allTimeChampionId: string | null;
  weekChampionId: string | null;
  /** Код приватной комнаты для ссылки-приглашения; в общей — null. */
  roomCode: string | null;
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
  /** Идентификатор получателя — клиенту удобнее не гадать, кто из игроков он. */
  youId: string;
}

export interface ChatMessagePayload {
  id: string;
  playerId: string;
  nickname: string;
  avatarId: number;
  text: string;
  at: number;
}

/** Ответ на действие игрока. */
export interface Ack {
  ok: boolean;
  error?: string;
}

export const CHAT_MAX_LENGTH = 300;
export const CHAT_HISTORY_SIZE = 100;

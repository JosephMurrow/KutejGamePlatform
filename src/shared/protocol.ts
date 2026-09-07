import type { Bet } from "@/lib/game/bet";
import type { EndMode, PauseReason, Phase } from "@/lib/game/room";
import type { RoomKind } from "./room-settings";

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
  /** Хозяин закрывает ставки досрочно и открывает вскрышку. */
  closeBetting: "round:close",
  /** Хозяин закрывает или открывает набор в комнату. */
  lock: "room:lock",
  /** Хозяин переименовывает гостя, не выгоняя его из партии. */
  rename: "room:rename",
  /** «Forever alone»: набить комнату ботами. */
  fillBots: "room:bots",
  dismissBots: "room:bots:out",
} as const;

/** Имя параметра подключения с кодом приватной комнаты. */
export const ROOM_QUERY = "room";

/**
 * Сорт подключения. Обычное — игрок за столом; `screen` — вид «экран»: он
 * подписан на комнату, но не садится в круг ходов и не знает ни одного секрета.
 */
export const VIEW_QUERY = "view";
export const SCREEN_VIEW = "screen";

/**
 * Ключ вида «экран». Браузерный источник OBS ходит со своей пустой банкой кук,
 * сессии у него нет — пропуском служит ключ комнаты в адресе.
 */
export const KEY_QUERY = "key";

export interface PlayerPayload {
  id: string;
  nickname: string;
  avatarId: number;
  score: number;
  roundsPlayed: number;
  /** Поставил ли в текущем раунде. Сама ставка до вскрышки не приходит. */
  hasBet: boolean;
  isHost: boolean;
  /** Гость: хозяин может его переименовать, не выкидывая из партии. */
  isGuest: boolean;
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
  /**
   * Состав. На большой комнате — верхушка таблицы, ты сам и ведущий, а не все
   * подряд: полный список никто не читает, а весит он на каждой рассылке.
   */
  players: PlayerPayload[];
  /** Сколько игроков за столом на самом деле. */
  playerCount: number;
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
  /** Какого рода комната. У общего зала экрана нет, поэтому там `private`. */
  roomKind: RoomKind;
  /** Название комнаты: рисуется на экране. У общей и у обычной своей — null. */
  roomTitle: string | null;
  /**
   * Смотрит ли это подключение экраном. У экрана нет места за столом, `youId`
   * пустой, а вопрос приходит только после открытия всем.
   */
  isScreen: boolean;
  /** Закрыт ли набор в комнату. */
  locked: boolean;
  /** Потолок числа игроков; null — без ограничения. */
  maxPlayers: number | null;
  /** Канал Твича, чей чат слушает комната; null — не слушает. */
  twitchChannel: string | null;
  /** Есть ли связь с чатом Твича прямо сейчас. */
  twitchConnected: boolean;
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

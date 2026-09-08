import type { RoomKind } from "./room-settings";

/**
 * Контракт сокетов платформы: типы делят клиент и сервер, поэтому здесь не
 * должно быть ничего серверного — только описания сообщений.
 *
 * И ничего игрового. Платформа держит соединение, комнату, состав и чат;
 * фазы, ставки и очки живут в протоколе игры, который расширяет здешние типы
 * (docs/BACKLOG.md A3).
 */

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

/** Действия, которые платформа понимает сама, без участия игры. */
export const CLIENT_EVENT = {
  chat: "chat:send",
  /** Хозяин приватной комнаты выгоняет игрока. */
  kick: "room:kick",
  /** Хозяин закрывает или открывает набор в комнату. */
  lock: "room:lock",
  /** Хозяин переименовывает гостя, не выгоняя его из партии. */
  rename: "room:rename",
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

/**
 * Игрок глазами платформы. Всё, что игрок заслужил по правилам — очки, ход,
 * ставка — лежит в игровом наследнике этого типа, а не здесь.
 */
export interface PlayerPayload {
  id: string;
  nickname: string;
  avatarId: number;
  /** Гость: хозяин может его переименовать, не выкидывая из партии. */
  isGuest: boolean;
}

/**
 * Снимок комнаты глазами платформы.
 *
 * Игра расширяет этот тип своими полями, а не кладёт их во вложенный объект:
 * на проводе снимок остаётся плоским, а `state.phase` в игровом коде читается
 * так же, как читался. Снимок по-прежнему один — он же восстановление после
 * реконнекта.
 */
export interface RoomStatePayload<
  TPlayer extends PlayerPayload = PlayerPayload,
> {
  roomKey: string;
  /** Абсолютное время конца фазы, unix ms. Таймер заводит платформа. */
  deadline: number | null;
  /** Полная длительность фазы: по ней рисуется шкала обратного отсчёта. */
  phaseDurationMs: number | null;
  /**
   * Время сервера в момент отправки. Часы клиента врут, поэтому обратный
   * отсчёт считается как deadline − serverTime, а не по локальному времени.
   */
  serverTime: number;
  /**
   * Состав. На большой комнате — верхушка таблицы, ты сам и ведущий, а не все
   * подряд: полный список никто не читает, а весит он на каждой рассылке.
   */
  players: TPlayer[];
  /** Сколько игроков за столом на самом деле. */
  playerCount: number;
  /** Хозяин приватной комнаты; в общей — null. */
  ownerId: string | null;
  /** Код приватной комнаты для ссылки-приглашения; в общей — null. */
  roomCode: string | null;
  /** Какого рода комната. У общего зала экрана нет, поэтому там `private`. */
  roomKind: RoomKind;
  /** Название комнаты: рисуется на экране. У общей и у обычной своей — null. */
  roomTitle: string | null;
  /**
   * Смотрит ли это подключение экраном. У экрана нет места за столом, `youId`
   * пустой, а секретов ему не показывают вовсе.
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

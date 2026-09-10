"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { Bet } from "@/games/pricetitute/engine/bet";
import {
  CLIENT_EVENT,
  KEY_QUERY,
  GAME_QUERY,
  ROOM_QUERY,
  SCREEN_VIEW,
  SERVER_EVENT,
  SOCKET_PATH,
  VIEW_QUERY,
  type Ack,
  type ChatMessagePayload,
} from "@/shared/protocol";
import { wakeOnReturn } from "@/shared/socket-wake";
import { type GameStatePayload } from "@/games/pricetitute/protocol";
import { GAME_EVENT, GAME_ID } from "@/games/pricetitute/protocol";

const ERROR_LIFETIME_MS = 4000;

/** Параметры подключения: код комнаты и, для экрана, его сорт с пропуском. */
function connectionQuery(
  roomCode?: string,
  screenKey?: string,
): Record<string, string> | undefined {
  // Общий зал ходит без кода комнаты, но игру называет всё равно: иначе
  // сервер не знает, чей это зал.
  if (!roomCode) return { [GAME_QUERY]: GAME_ID };

  const query: Record<string, string> = {
    [ROOM_QUERY]: roomCode,
    [GAME_QUERY]: GAME_ID,
  };
  if (screenKey !== undefined) {
    query[VIEW_QUERY] = SCREEN_VIEW;
    query[KEY_QUERY] = screenKey;
  }

  return query;
}

export interface GameRoomHandle {
  state: GameStatePayload | null;
  chat: ChatMessagePayload[];
  connected: boolean;
  /** Насколько часы сервера впереди клиентских, мс. */
  clockOffset: number;
  error: string | null;
  /** Заполнено, если сервер выставил из комнаты: причина и конец связи. */
  kicked: string | null;
  confirmRead: () => Promise<void>;
  submitAnswer: (bet: Bet) => Promise<void>;
  placeBet: (bet: Bet) => Promise<void>;
  sendChat: (text: string) => Promise<boolean>;
  /** Хозяин приватной комнаты выгоняет игрока. */
  kick: (playerId: string) => Promise<void>;
  /** Хозяин начинает новую партию после финального экрана. */
  restart: () => Promise<void>;
  /** Хозяин закрывает ставки досрочно. */
  closeBetting: () => Promise<void>;
  /** Хозяин закрывает или открывает набор в комнату. */
  setLocked: (locked: boolean) => Promise<void>;
  /** Хозяин переименовывает гостя. */
  renamePlayer: (playerId: string, nickname: string) => Promise<boolean>;
  /** «Forever alone»: позвать в комнату ботов. */
  inviteBots: (count?: number) => Promise<void>;
  dismissBots: () => Promise<void>;
}

/**
 * Подключение к игровой комнате. Сервер шлёт полный снимок состояния, поэтому
 * хук ничего не досчитывает — только хранит последний снимок и поправку часов.
 *
 * С `screenKey` тот же хук подключается видом «экран»: за стол не садится,
 * секретов не получает и действий не шлёт. Ключ передаётся строкой, а не
 * объектом, нарочно — объект менял бы личность на каждом рендере и пересоздавал
 * бы сокет.
 */
export function useGameRoom(
  roomCode?: string,
  screenKey?: string,
): GameRoomHandle {
  const [state, setState] = useState<GameStatePayload | null>(null);
  const [chat, setChat] = useState<ChatMessagePayload[]>([]);
  const [connected, setConnected] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [kicked, setKicked] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io({
      path: SOCKET_PATH,
      query: connectionQuery(roomCode, screenKey),
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setError(null);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", (reason: Error) => {
      setConnected(false);
      setError(reason.message);
    });

    socket.on(SERVER_EVENT.state, (payload: GameStatePayload) => {
      setClockOffset(payload.serverTime - Date.now());
      setState(payload);
    });
    socket.on(SERVER_EVENT.kicked, (payload: { reason?: string }) => {
      setKicked(payload?.reason ?? "Комната больше недоступна");
      // Переподключаться незачем — обратно всё равно не пустят.
      socket.disconnect();
    });
    socket.on(SERVER_EVENT.chatHistory, (history: ChatMessagePayload[]) => {
      setChat(history);
    });
    socket.on(SERVER_EVENT.chatMessage, (message: ChatMessagePayload) => {
      setChat((previous) => [...previous, message].slice(-100));
    });

    // Вернулись в приложение с фона — проверяем связь сразу, не дожидаясь
    // очередной попытки socket.io: на сервере отсрочка всего пятнадцать
    // секунд (src/shared/socket-wake.ts).
    const stopWaking = wakeOnReturn(socket);

    return () => {
      stopWaking();
      socket.close();
      socketRef.current = null;
    };
  }, [roomCode, screenKey]);

  // Ошибка действия — это подсказка на секунду, а не состояние экрана.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), ERROR_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [error]);

  const emit = useCallback(
    (event: string, payload: unknown = {}): Promise<Ack> =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket) {
          resolve({ ok: false, error: "Нет соединения с сервером" });
          return;
        }
        socket.emit(event, payload, (ack: Ack) => resolve(ack));
      }),
    [],
  );

  const act = useCallback(
    async (event: string, payload?: unknown): Promise<boolean> => {
      const ack = await emit(event, payload);
      if (!ack.ok) setError(ack.error ?? "Действие отклонено");
      return ack.ok;
    },
    [emit],
  );

  const confirmRead = useCallback(async () => {
    await act(GAME_EVENT.read);
  }, [act]);

  const submitAnswer = useCallback(
    async (bet: Bet) => {
      await act(GAME_EVENT.answer, { bet });
    },
    [act],
  );

  const placeBet = useCallback(
    async (bet: Bet) => {
      await act(GAME_EVENT.bet, { bet });
    },
    [act],
  );

  const sendChat = useCallback(
    (text: string) => act(CLIENT_EVENT.chat, { text }),
    [act],
  );

  const kick = useCallback(
    async (playerId: string) => {
      await act(CLIENT_EVENT.kick, { playerId });
    },
    [act],
  );

  const restart = useCallback(async () => {
    await act(GAME_EVENT.restart);
  }, [act]);

  const closeBetting = useCallback(async () => {
    await act(GAME_EVENT.closeBetting);
  }, [act]);

  const setLocked = useCallback(
    async (locked: boolean) => {
      await act(CLIENT_EVENT.lock, { locked });
    },
    [act],
  );

  const renamePlayer = useCallback(
    (playerId: string, nickname: string) =>
      act(CLIENT_EVENT.rename, { playerId, nickname }),
    [act],
  );

  const inviteBots = useCallback(
    async (count?: number) => {
      await act(
        GAME_EVENT.fillBots,
        count === undefined ? undefined : { count },
      );
    },
    [act],
  );

  const dismissBots = useCallback(async () => {
    await act(GAME_EVENT.dismissBots);
  }, [act]);

  return {
    state,
    chat,
    connected,
    clockOffset,
    error,
    kicked,
    confirmRead,
    submitAnswer,
    placeBet,
    sendChat,
    kick,
    restart,
    closeBetting,
    setLocked,
    renamePlayer,
    inviteBots,
    dismissBots,
  };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  CLIENT_EVENT,
  GAME_QUERY,
  KEY_QUERY,
  ROOM_QUERY,
  SCREEN_VIEW,
  SERVER_EVENT,
  SOCKET_PATH,
  VIEW_QUERY,
  type Ack,
  type ChatMessagePayload,
} from "@/shared/protocol";
import { wakeOnReturn } from "@/shared/socket-wake";
import { GAME_EVENT, GAME_ID, type TurboStatePayload } from "../protocol";

/**
 * Подключение к комнате турбо-шахмат.
 *
 * Сервер шлёт полный снимок, поэтому хук ничего не досчитывает — только хранит
 * последний снимок и поправку часов. Единственная настоящая доска — серверная;
 * здесь её отражение.
 *
 * Взято копией у шахмат (src/games/chess/components/useChessRoom.ts): игра не
 * импортирует игру. Без очереди зала и без Магнуса — их у турбо-шахмат нет.
 */

const ERROR_LIFETIME_MS = 4000;

/** Ход на проводе: координаты, фигура превращения и номер полухода. */
export interface MoveRequest {
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
  ply: number;
}

export interface TurboRoomHandle {
  state: TurboStatePayload | null;
  connected: boolean;
  /** Чат комнаты. */
  chat: ChatMessagePayload[];
  sendChat: (text: string) => Promise<boolean>;
  /** Насколько часы сервера впереди клиентских, мс. */
  clockOffset: number;
  error: string | null;
  /** Заполнено, если сервер выставил из комнаты. */
  kicked: string | null;
  /** Сделать ход. `false` — сервер отказал, доску надо вернуть как было. */
  move: (request: MoveRequest) => Promise<boolean>;
  resign: () => Promise<void>;
  claimDraw: () => Promise<void>;
  /** Предложить ничью — или принять чужое предложение, если оно висит. */
  offerDraw: () => Promise<void>;
  declineDraw: () => Promise<void>;
  /** Ещё партия в той же комнате: места меняются. */
  rematch: () => Promise<void>;
  /** «Ядерные»: сбросить бомбу вместо хода. */
  bomb: () => Promise<void>;
}

function connectionQuery(
  roomCode: string,
  screenKey?: string,
): Record<string, string> {
  // Игру называем всегда: без параметра сервер посадит за стол платитутки.
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

export function useTurboRoom(
  roomCode: string,
  screenKey?: string,
): TurboRoomHandle {
  const [state, setState] = useState<TurboStatePayload | null>(null);
  const [connected, setConnected] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [kicked, setKicked] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessagePayload[]>([]);
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

    socket.on(SERVER_EVENT.chatHistory, (history: ChatMessagePayload[]) => {
      setChat(history);
    });
    socket.on(SERVER_EVENT.chatMessage, (message: ChatMessagePayload) => {
      setChat((was) => [...was, message]);
    });

    socket.on(SERVER_EVENT.state, (payload: TurboStatePayload) => {
      setClockOffset(payload.serverTime - Date.now());
      setState(payload);
    });
    socket.on(SERVER_EVENT.kicked, (payload: { reason?: string }) => {
      setKicked(payload?.reason ?? "Комната больше недоступна");
      // Переподключаться незачем — обратно всё равно не пустят.
      socket.disconnect();
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

  const act = useCallback(
    (event: string, payload: unknown = {}): Promise<boolean> =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket) {
          setError("Нет соединения с сервером");
          resolve(false);
          return;
        }

        socket.emit(event, payload, (ack: Ack) => {
          if (!ack.ok) setError(ack.error ?? "Действие отклонено");
          resolve(ack.ok);
        });
      }),
    [],
  );

  const move = useCallback(
    (request: MoveRequest) => act(GAME_EVENT.move, request),
    [act],
  );

  const resign = useCallback(async () => {
    await act(GAME_EVENT.resign);
  }, [act]);

  const claimDraw = useCallback(async () => {
    await act(GAME_EVENT.claimDraw);
  }, [act]);

  const sendChat = useCallback(
    (text: string) => act(CLIENT_EVENT.chat, { text }),
    [act],
  );

  const offerDraw = useCallback(async () => {
    await act(GAME_EVENT.offerDraw);
  }, [act]);

  const declineDraw = useCallback(async () => {
    await act(GAME_EVENT.declineDraw);
  }, [act]);

  const rematch = useCallback(async () => {
    await act(GAME_EVENT.rematch);
  }, [act]);

  const bomb = useCallback(async () => {
    await act(GAME_EVENT.bomb);
  }, [act]);

  return {
    state,
    connected,
    chat,
    sendChat,
    clockOffset,
    error,
    kicked,
    move,
    resign,
    claimDraw,
    offerDraw,
    declineDraw,
    rematch,
    bomb,
  };
}

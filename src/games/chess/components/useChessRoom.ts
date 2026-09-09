"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  GAME_QUERY,
  KEY_QUERY,
  ROOM_QUERY,
  SCREEN_VIEW,
  SERVER_EVENT,
  SOCKET_PATH,
  VIEW_QUERY,
  type Ack,
} from "@/shared/protocol";
import {
  GAME_EVENT,
  GAME_ID,
  type ChessStatePayload,
} from "@/games/chess/protocol";

/**
 * Подключение к шахматной комнате.
 *
 * Сервер шлёт полный снимок, поэтому хук ничего не досчитывает — только хранит
 * последний снимок и поправку часов. Единственная настоящая доска — серверная;
 * здесь её отражение.
 */

const ERROR_LIFETIME_MS = 4000;

/** Ход на проводе: координаты, фигура превращения и номер полухода. */
export interface MoveRequest {
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
  ply: number;
}

export interface ChessRoomHandle {
  state: ChessStatePayload | null;
  connected: boolean;
  /** Насколько часы сервера впереди клиентских, мс. */
  clockOffset: number;
  error: string | null;
  /** Заполнено, если сервер выставил из комнаты. */
  kicked: string | null;
  /** Сделать ход. `false` — сервер отказал, доску надо вернуть как было. */
  move: (request: MoveRequest) => Promise<boolean>;
  resign: () => Promise<void>;
  claimDraw: () => Promise<void>;
  /** Ещё партия в той же комнате: цвета меняются местами. */
  rematch: () => Promise<void>;
  /** Уйти из очереди зала. */
  leaveQueue: () => Promise<void>;
}

function connectionQuery(
  roomCode?: string,
  screenKey?: string,
): Record<string, string> {
  // Общий зал ходит без кода комнаты, но игру называет всё равно: иначе сервер
  // посадит за стол платитутки.
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

export function useChessRoom(
  roomCode?: string,
  screenKey?: string,
): ChessRoomHandle {
  const [state, setState] = useState<ChessStatePayload | null>(null);
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

    socket.on(SERVER_EVENT.state, (payload: ChessStatePayload) => {
      setClockOffset(payload.serverTime - Date.now());
      setState(payload);
    });
    socket.on(SERVER_EVENT.kicked, (payload: { reason?: string }) => {
      setKicked(payload?.reason ?? "Комната больше недоступна");
      // Переподключаться незачем — обратно всё равно не пустят.
      socket.disconnect();
    });

    return () => {
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

  const rematch = useCallback(async () => {
    await act(GAME_EVENT.rematch);
  }, [act]);

  const leaveQueue = useCallback(async () => {
    await act(GAME_EVENT.leaveQueue);
  }, [act]);

  return {
    state,
    connected,
    clockOffset,
    error,
    kicked,
    move,
    resign,
    claimDraw,
    rematch,
    leaveQueue,
  };
}

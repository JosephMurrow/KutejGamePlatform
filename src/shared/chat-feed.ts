import { SERVER_EVENT, type ChatMessagePayload } from "./protocol";

/**
 * Лента чата комнаты на клиенте: история при входе и свежие сообщения следом.
 *
 * Чат у всех игр один — компонент, сервер и протокол платформенные, — а
 * подписка на него жила копией в хуке каждой игры и успела разъехаться:
 * платитутка резала ленту до ста сообщений, шахматы нет. Теперь подписка тоже
 * одна. Ленту не режем нигде: сервер и так отдаёт при входе только хвост
 * (`CHAT_HISTORY_SIZE`), а за одну партию сообщений не наберётся столько,
 * чтобы это стало заметно.
 */

/** Всё, что нужно от сокета: подписаться на событие. */
export interface ChatSource {
  on(event: string, listener: (payload: never) => void): unknown;
}

type SetChat = (
  update:
    | ChatMessagePayload[]
    | ((was: ChatMessagePayload[]) => ChatMessagePayload[]),
) => void;

export function listenChat(socket: ChatSource, setChat: SetChat): void {
  socket.on(SERVER_EVENT.chatHistory, (history: ChatMessagePayload[]) => {
    setChat(history);
  });
  socket.on(SERVER_EVENT.chatMessage, (message: ChatMessagePayload) => {
    setChat((was) => [...was, message]);
  });
}

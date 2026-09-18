import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listenChat } from "./chat-feed";
import { SERVER_EVENT, type ChatMessagePayload } from "./protocol";

function message(id: string): ChatMessagePayload {
  return {
    id,
    playerId: "p",
    nickname: "Игрок",
    avatarId: 1,
    text: id,
    at: 0,
  };
}

/** Сокет-заглушка: помнит подписки и умеет прислать событие. */
function fakeSocket() {
  const handlers = new Map<string, (payload: never) => void>();
  return {
    on(event: string, listener: (payload: never) => void) {
      handlers.set(event, listener);
    },
    emit(event: string, payload: unknown) {
      handlers.get(event)?.(payload as never);
    },
  };
}

/** Лента как в React: состояние плюс setState с функцией или значением. */
function feed() {
  let chat: ChatMessagePayload[] = [];
  const socket = fakeSocket();
  listenChat(socket, (update) => {
    chat = typeof update === "function" ? update(chat) : update;
  });
  return { socket, read: () => chat };
}

describe("listenChat", () => {
  it("история при входе заменяет ленту целиком", () => {
    const { socket, read } = feed();
    socket.emit(SERVER_EVENT.chatMessage, message("старое"));
    socket.emit(SERVER_EVENT.chatHistory, [message("a"), message("b")]);

    assert.deepEqual(
      read().map((m) => m.id),
      ["a", "b"],
    );
  });

  it("свежие сообщения дописываются в конец и не обрезаются", () => {
    const { socket, read } = feed();
    socket.emit(SERVER_EVENT.chatHistory, []);
    for (let at = 0; at < 150; at += 1) {
      socket.emit(SERVER_EVENT.chatMessage, message(String(at)));
    }

    assert.equal(read().length, 150);
    assert.equal(read().at(-1)?.id, "149");
  });
});

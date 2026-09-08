import { normalizeChannel } from "../src/shared/twitch";
import { parseIrcLine, toMessage } from "../src/server/twitch/chat";

/**
 * Проверка связи с чатом Твича, по образцу `mail-check.ts`.
 *
 * Подключается анонимно и слушает канал столько, сколько сказано. Нужна ровно
 * затем, чтобы отличить «команда не работает» от «до канала не достучались»:
 *
 *   npm run twitch:check -- <канал> [секунд]
 */
const raw = process.argv[2] ?? "";
const seconds = Number(process.argv[3] ?? 20);

const channel = normalizeChannel(raw);
if (channel === null) {
  console.error("Укажи канал: npm run twitch:check -- <канал> [секунд]");
  process.exit(1);
}

console.log(`Подключаемся к #${channel} на ${seconds} с…\n`);

const socket = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
let messages = 0;
let joined = false;

socket.addEventListener("open", () => {
  socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
  socket.send(`NICK justinfan${Math.floor(Math.random() * 100_000)}`);
  socket.send(`JOIN #${channel}`);
});

socket.addEventListener("message", (event: MessageEvent) => {
  const data = typeof event.data === "string" ? event.data : "";

  for (const raw of data.split("\r\n")) {
    const line = parseIrcLine(raw);
    if (!line) continue;

    if (line.command === "PING") {
      socket.send(`PONG :${line.params[0] ?? "tmi.twitch.tv"}`);
      continue;
    }

    // 001 — приветствие, 366 — конец списка участников, то есть вход состоялся.
    if (line.command === "001") console.log("✓ соединение установлено");
    if (line.command === "366" && !joined) {
      joined = true;
      console.log(`✓ вошли в #${channel}, слушаем\n`);
    }
    if (line.command === "NOTICE") {
      console.log(`! ${line.params.join(" ")}`);
    }

    const message = toMessage(line);
    if (message) {
      messages += 1;
      const mark = message.privileged ? "*" : " ";
      console.log(
        `${mark} ${message.displayName ?? message.login}: ${message.text}`,
      );
    }
  }
});

socket.addEventListener("error", () => {
  console.error("✗ не удалось подключиться");
  process.exit(1);
});

setTimeout(() => {
  console.log(
    `\nИтог: вход ${joined ? "удался" : "не удался"}, сообщений ${messages}`,
  );
  socket.close();
  process.exit(joined ? 0 : 1);
}, seconds * 1000);

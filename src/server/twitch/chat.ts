/**
 * Чтение чата Твича.
 *
 * Анонимное подключение под ником `justinfan<число>` читает любой публичный
 * чат: ни регистрации приложения, ни OAuth, ни разрешения стримера — комнате
 * достаточно знать имя канала. Это и есть причина, по которой чтение сделано
 * отдельно от отправки: отправка требует приложения и токенов, а чтение даёт
 * весь игровой смысл и не требует от стримера ничего (см. docs/BACKLOG.md P1).
 *
 * IRC у Твича живой: в 2025-м выключили незащищённые WebSocket-подключения и
 * убрали чат-команды, а чтение и отправку сообщений оставили. EventSub —
 * рекомендованная замена, но анонима он не умеет вовсе, а нам нужен именно он.
 *
 * Своей зависимости не заводим: `WebSocket` есть в Node начиная с 22-й.
 */

const ENDPOINT = "wss://irc-ws.chat.twitch.tv:443";

/** Через сколько пробовать снова после обрыва. Растёт до минуты. */
const RETRY_START_MS = 2_000;
const RETRY_MAX_MS = 60_000;

/**
 * Твич сам шлёт PING примерно раз в пять минут. Если молчит дольше — связь
 * умерла тихо, и надо переподключаться, не дожидаясь события `close`.
 */
const SILENCE_LIMIT_MS = 6 * 60 * 1000;

export interface TwitchMessage {
  /** Числовой идентификатор зрителя. Ник меняется, он — нет. */
  userId: string;
  login: string;
  displayName: string | undefined;
  text: string;
  /** Модератор канала или сам стример: им доступны служебные команды. */
  privileged: boolean;
}

/** Разобранная строка протокола IRC. */
export interface IrcLine {
  tags: Map<string, string>;
  /** Отправитель до восклицательного знака: `nick!user@host`. */
  prefix: string;
  command: string;
  params: string[];
}

/**
 * Разбор строки IRC вместе с тегами.
 *
 * Формат простой и стабильный: `@tags :prefix COMMAND params :trailing`. Тянуть
 * ради него библиотеку незачем — тут полтора десятка строк.
 */
export function parseIrcLine(raw: string): IrcLine | null {
  let rest = raw.trim();
  if (rest === "") return null;

  const tags = new Map<string, string>();

  if (rest.startsWith("@")) {
    const end = rest.indexOf(" ");
    if (end === -1) return null;

    for (const pair of rest.slice(1, end).split(";")) {
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      tags.set(pair.slice(0, eq), unescapeTag(pair.slice(eq + 1)));
    }

    rest = rest.slice(end + 1);
  }

  let prefix = "";
  if (rest.startsWith(":")) {
    const end = rest.indexOf(" ");
    if (end === -1) return null;
    prefix = rest.slice(1, end);
    rest = rest.slice(end + 1);
  }

  // Последний параметр начинается с двоеточия и может содержать пробелы.
  const trailingAt = rest.indexOf(" :");
  const head = trailingAt === -1 ? rest : rest.slice(0, trailingAt);
  const trailing = trailingAt === -1 ? null : rest.slice(trailingAt + 2);

  const parts = head.split(" ").filter((part) => part !== "");
  const command = parts.shift() ?? "";
  if (trailing !== null) parts.push(trailing);

  return { tags, prefix, command, params: parts };
}

/** Теги приезжают экранированными: пробел — `\s`, точка с запятой — `\:`. */
function unescapeTag(value: string): string {
  return value
    .replace(/\\s/g, " ")
    .replace(/\\:/g, ";")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");
}

/** Сообщение зрителя из строки PRIVMSG. `null` — это не сообщение чата. */
export function toMessage(line: IrcLine): TwitchMessage | null {
  if (line.command !== "PRIVMSG") return null;

  const userId = line.tags.get("user-id");
  const text = line.params[1];
  if (!userId || text === undefined) return null;

  const login = line.prefix.split("!")[0] ?? "";
  const badges = line.tags.get("badges") ?? "";

  return {
    userId,
    login,
    displayName: line.tags.get("display-name"),
    text,
    privileged:
      line.tags.get("mod") === "1" ||
      badges.includes("broadcaster/") ||
      badges.includes("moderator/"),
  };
}

/** Имя канала как его понимает IRC: в нижнем регистре и без решётки. */
export function normalizeChannel(raw: string): string | null {
  const channel = raw
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/^https?:\/\/(www\.)?twitch\.tv\//, "")
    .replace(/\/.*$/, "");

  return /^[a-z0-9_]{3,25}$/.test(channel) ? channel : null;
}

export interface ChatReaderOptions {
  channel: string;
  onMessage: (message: TwitchMessage) => void;
  /** Смена состояния связи: комната показывает её хозяину. */
  onStatus?: (connected: boolean) => void;
}

/**
 * Подключение к одному каналу. Само переподключается и само отвечает на PING.
 */
export class ChatReader {
  private socket: WebSocket | null = null;
  private retryMs = RETRY_START_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private lastHeard = 0;
  private stopped = false;

  constructor(private readonly options: ChatReaderOptions) {}

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();

    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private open(): void {
    if (this.stopped) return;

    const socket = new WebSocket(ENDPOINT);
    this.socket = socket;
    this.lastHeard = Date.now();

    socket.addEventListener("open", () => {
      // Теги нужны ради user-id и значков: без них зритель — просто ник,
      // который он в любой момент поменяет.
      socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      socket.send(`NICK justinfan${Math.floor(Math.random() * 100_000)}`);
      socket.send(`JOIN #${this.options.channel}`);

      this.retryMs = RETRY_START_MS;
      this.options.onStatus?.(true);
    });

    socket.addEventListener("message", (event: MessageEvent) => {
      this.lastHeard = Date.now();
      const data = typeof event.data === "string" ? event.data : "";

      for (const raw of data.split("\r\n")) {
        this.handle(raw);
      }
    });

    socket.addEventListener("close", () => this.reopen());
    socket.addEventListener("error", () => this.reopen());

    this.watchdog ??= setInterval(() => {
      if (Date.now() - this.lastHeard > SILENCE_LIMIT_MS) this.reopen();
    }, 30_000);
    this.watchdog.unref?.();
  }

  private handle(raw: string): void {
    const line = parseIrcLine(raw);
    if (!line) return;

    if (line.command === "PING") {
      this.socket?.send(`PONG :${line.params[0] ?? "tmi.twitch.tv"}`);
      return;
    }

    const message = toMessage(line);
    if (message) this.options.onMessage(message);
  }

  private reopen(): void {
    if (this.stopped || this.retryTimer !== null) return;

    this.options.onStatus?.(false);

    const socket = this.socket;
    this.socket = null;
    socket?.close();

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, this.retryMs);
    this.retryTimer.unref?.();

    this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS);
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    this.retryTimer = null;
    this.watchdog = null;
  }
}

import { MAX_SUM, NEVER, type Bet } from "@/lib/game/bet";

/**
 * Команды из чата Твича.
 *
 * Разбор живёт отдельно от подключения и ничего о нём не знает: так его можно
 * прогнать тестами, не поднимая ни сокета, ни комнаты.
 *
 * Ставка из чата видна всем — это ломает правило «ставки не видны до вскрытия»
 * (SPEC §4). Разобрано в docs/BACKLOG.md P3: либо бот удаляет сообщение, либо
 * комната честно предупреждает, что чат ставит на виду.
 */

export type TwitchCommand =
  | { kind: "bet"; bet: Bet }
  /** Сесть за стол. Без этого в составе оказался бы весь чат. */
  | { kind: "join" }
  | { kind: "leave" }
  /** Повторить вопрос в чат: зритель видит картинку с задержкой. */
  | { kind: "question" }
  | { kind: "top" };

/** Множители на конце суммы: «!10к» — это десять тысяч. */
const SCALE: Record<string, number> = {
  к: 1_000,
  k: 1_000,
  т: 1_000,
  м: 1_000_000,
  m: 1_000_000,
  кк: 1_000_000,
  kk: 1_000_000,
};

const FREE = ["бесплатно", "даром", "free", "0"];
const NEVER_WORDS = ["никогда", "низачто", "ниzачто", "never", "нет"];
const JOIN = ["я", "играю", "играть", "join", "вход"];
const LEAVE = ["выход", "ухожу", "leave", "стоп"];
const QUESTION = ["вопрос", "q", "что"];
const TOP = ["топ", "top", "счет", "счёт", "таблица"];

/**
 * Разобрать сообщение чата. `null` — это не команда, а просто разговор.
 *
 * Регистр и лишние пробелы не важны: в чате пишут как придётся.
 */
export function parseCommand(raw: string): TwitchCommand | null {
  const text = raw.trim().toLowerCase();
  if (!text.startsWith("!")) return null;

  const body = text.slice(1).trim();
  if (body === "") return null;

  const [head = "", ...rest] = body.split(/\s+/);
  const tail = rest.join(" ");

  if (FREE.includes(head)) return { kind: "bet", bet: 0 };
  if (NEVER_WORDS.includes(head)) return { kind: "bet", bet: NEVER };
  if (JOIN.includes(head)) return { kind: "join" };
  if (LEAVE.includes(head)) return { kind: "leave" };
  if (QUESTION.includes(head)) return { kind: "question" };
  if (TOP.includes(head)) return { kind: "top" };

  // «!ставка 10000» и «!bet 10k»: сумма едет вторым словом.
  if (head === "ставка" || head === "bet") {
    const bet = parseSum(tail);
    return bet === null ? null : { kind: "bet", bet };
  }

  // «!10000» и «!10к»: сумма прямо после восклицательного знака. Пробел между
  // ней и знаком тоже терпим — в чате пишут и так.
  const bet = parseSum(body);
  return bet === null ? null : { kind: "bet", bet };
}

/**
 * Сумма из текста. Пробелы внутри числа не мешают — их ставят разрядами, — а
 * «к» и «м» на конце умножают.
 */
export function parseSum(raw: string): Bet | null {
  const text = raw.replace(/\s+/g, "").replace(",", ".");
  const match = /^(\d+(?:\.\d+)?)(кк|kk|к|k|т|м|m)?$/.exec(text);
  if (!match) return null;

  const [, digits = "", suffix] = match;
  const scale = suffix ? (SCALE[suffix] ?? 1) : 1;
  const value = Math.round(Number(digits) * scale);

  if (!Number.isFinite(value) || value < 0) return null;
  if (value > MAX_SUM) return null;

  return value;
}

/**
 * Ник для стола. Твич отдаёт `display-name` не всегда — если его нет, берём
 * логин из самого сообщения.
 */
export function twitchNickname(
  displayName: string | undefined,
  login: string,
): string {
  const name = (displayName ?? "").trim();
  return name === "" ? login : name;
}

/** Логин гостя, заведённого под зрителя Твича. Идентификатор стабилен, ник — нет. */
export function twitchLogin(userId: string): string {
  return `twitch_${userId}`;
}

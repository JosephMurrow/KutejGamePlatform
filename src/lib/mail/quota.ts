import { RateLimiter } from "../../server/rate-limit";

/**
 * Квота писем (docs/SECURITY.md, S-B2).
 *
 * Письмо уходит на адрес, который вписал посторонний: регистрация и привязка
 * почты шлют туда, куда попросили. Без квоты форма превращается в рассылку
 * спама с нашего ящика — на чужой адрес по кругу. Хуже самого спама то, что
 * почтовая служба за него банит ящик, и письма перестают доходить всем, а с
 * ними ломается и восстановление пароля.
 *
 * Два потолка:
 *
 * - **на адрес получателя** — один ящик не завалить, откуда бы ни шли
 *   просьбы;
 * - **на весь процесс** — держит нас ниже суточного лимита служб (у Яндекса и
 *   Mail.ru это сотни писем в сутки), даже если адреса каждый раз новые.
 *
 * Квота проверяется в `sendLetter`, а не в экшенах: так её не обойдёт ни один
 * новый вызов.
 */

/** Писем на один адрес за окно. */
export const LETTERS_PER_RECIPIENT = 3;
/** Писем с процесса за окно, на все адреса вместе. */
export const LETTERS_PER_PROCESS = 60;
/** Окно обоих потолков. */
export const LETTER_WINDOW_MS = 60 * 60 * 1000;

/** Общий ключ счётчика процесса. */
const EVERYONE = "*";

export class LetterQuota {
  private readonly perRecipient: RateLimiter;
  private readonly perProcess: RateLimiter;

  constructor(
    limits: { recipient: number; process: number; windowMs: number } = {
      recipient: LETTERS_PER_RECIPIENT,
      process: LETTERS_PER_PROCESS,
      windowMs: LETTER_WINDOW_MS,
    },
  ) {
    this.perRecipient = new RateLimiter(limits.recipient, limits.windowMs);
    this.perProcess = new RateLimiter(limits.process, limits.windowMs);
  }

  /**
   * Можно ли отправить письмо на этот адрес. `true` — можно, и письмо
   * засчитано обоим потолкам; `false` — нельзя, ничего не засчитано.
   */
  take(to: string, now = Date.now()): boolean {
    const recipient = to.trim().toLowerCase();

    if (this.perRecipient.blocked(recipient, now)) return false;
    if (this.perProcess.blocked(EVERYONE, now)) return false;

    this.perRecipient.hit(recipient, now);
    this.perProcess.hit(EVERYONE, now);
    return true;
  }
}

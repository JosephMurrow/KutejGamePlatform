import { createTransport, type Transporter } from "nodemailer";
import { env } from "@/lib/env";
import type { Letter } from "./letter";
import { LetterQuota } from "./quota";

/**
 * Отправка писем через внешний релей.
 *
 * Своего почтового сервера у нас нет и не будет: письма с домашнего адреса
 * либо режут на входе, либо кладут в спам. Здесь только SMTP-клиент, поэтому
 * подойдёт любая служба — в настройках задаётся хост, порт и учётка.
 */

let transport: Transporter | null = null;

/** Настроена ли отправка. Без хоста письма не уходят, и это не ошибка. */
export function isMailConfigured(): boolean {
  return env.MAIL_HOST !== "";
}

function mailer(): Transporter {
  transport ??= createTransport({
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    // 465 — это TLS с первого байта, остальные порты поднимают шифрование
    // командой STARTTLS уже внутри соединения.
    secure: env.MAIL_PORT === 465,
    // Песочница для разработки принимает почту без пароля.
    auth: env.MAIL_USER
      ? { user: env.MAIL_USER, pass: env.MAIL_PASSWORD }
      : undefined,
  });

  return transport;
}

/** Потолки на письма: на один адрес и на весь процесс. */
const quota = new LetterQuota();

/**
 * Чем кончилась отправка:
 *
 * - `sent` — релей принял письмо;
 * - `off` — отправка не настроена (нет `MAIL_HOST`);
 * - `limit` — упёрлись в квоту (`./quota.ts`), письмо не отправлялось;
 * - `failed` — релей не принял.
 */
export type LetterOutcome = "sent" | "off" | "limit" | "failed";

/**
 * Отправить письмо. Не бросает: что сказать человеку, решает вызывающий по
 * исходу.
 */
export async function sendLetter(
  to: string,
  letter: Letter,
): Promise<LetterOutcome> {
  if (!isMailConfigured()) {
    console.warn(`[почта] не настроена, письмо «${letter.subject}» не ушло`);
    return "off";
  }

  if (!quota.take(to)) {
    // Адрес в лог не пишем целиком: это чужая почта.
    console.warn(
      `[почта] лимит: письмо «${letter.subject}» на ${maskAddress(to)} не ушло`,
    );
    return "limit";
  }

  try {
    await mailer().sendMail({
      from: env.MAIL_FROM,
      to,
      subject: letter.subject,
      text: letter.text,
      html: letter.html,
    });

    return "sent";
  } catch (error) {
    console.error("[почта] отправка не удалась:", error);
    return "failed";
  }
}

/** `anya@mail.ru` → `a***@mail.ru`: в логе видно, куда, но не чья почта. */
export function maskAddress(address: string): string {
  const at = address.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${address[0]}***${address.slice(at)}`;
}

/** Ссылка для письма: собирается от внешнего адреса, а не от запроса. */
export function appLink(path: string): string {
  return new URL(path, env.APP_URL).toString();
}

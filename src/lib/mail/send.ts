import { createTransport, type Transporter } from "nodemailer";
import { env } from "@/lib/env";
import type { Letter } from "./letter";

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

/**
 * Отправить письмо. Возвращает `false`, если отправка не настроена или релей
 * не принял письмо: вызывающий сам решает, что сказать человеку.
 */
export async function sendLetter(to: string, letter: Letter): Promise<boolean> {
  if (!isMailConfigured()) {
    console.warn(`[почта] не настроена, письмо «${letter.subject}» не ушло`);
    return false;
  }

  try {
    await mailer().sendMail({
      from: env.MAIL_FROM,
      to,
      subject: letter.subject,
      text: letter.text,
      html: letter.html,
    });

    return true;
  } catch (error) {
    console.error("[почта] отправка не удалась:", error);
    return false;
  }
}

/** Ссылка для письма: собирается от внешнего адреса, а не от запроса. */
export function appLink(path: string): string {
  return new URL(path, env.APP_URL).toString();
}

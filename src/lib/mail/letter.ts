/**
 * Оформление письма: один шаблон на все случаи.
 *
 * Рядом с разметкой всегда идёт простой текст — часть почтовиков показывает
 * именно его, а письмо без текстовой части чаще попадает в спам.
 */
import { BRAND } from "@/lib/brand";

export interface Letter {
  subject: string;
  html: string;
  text: string;
}

export interface LetterParts {
  subject: string;
  /** Заголовок внутри письма. */
  heading: string;
  /** Абзацы письма. */
  lines: string[];
  /** Кнопка со ссылкой, если письмо к чему-то ведёт. */
  action?: { label: string; url: string };
  /** Приписка мелким шрифтом. */
  footer?: string;
}

/** Цвета письма заданы числами: в почте переменных CSS нет. */
const CRIMSON = "#d31450";
const INK = "#2a0912";
const MUTED = "#96697a";
const LINE = "#f7cbd9";
const BLUSH = "#fff5f8";

export function buildLetter(parts: LetterParts): Letter {
  const { subject, heading, lines, action, footer } = parts;

  const paragraphs = lines
    .map(
      (line) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK}">${escape(line)}</p>`,
    )
    .join("");

  const button = action
    ? `<p style="margin:22px 0 0">
         <a href="${escape(action.url)}" style="display:inline-block;padding:12px 22px;border-radius:12px;background:${CRIMSON};color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">${escape(action.label)}</a>
       </p>
       <p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:${MUTED}">Если кнопка не открывается, скопируй ссылку: ${escape(action.url)}</p>`
    : "";

  const note = footer
    ? `<p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:${MUTED}">${escape(footer)}</p>`
    : "";

  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:24px;background:${BLUSH};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" style="max-width:520px;margin:0 auto;border-collapse:collapse">
    <tr><td style="padding:0 0 18px;font-size:20px;font-weight:700;color:${INK}">Плати<span style="color:${CRIMSON}">тутка</span></td></tr>
    <tr><td style="padding:22px;background:#ffffff;border:1px solid ${LINE};border-radius:16px">
      <h1 style="margin:0 0 14px;font-size:18px;color:${INK}">${escape(heading)}</h1>
      ${paragraphs}${button}${note}
    </td></tr>
  </table>
</body></html>`;

  const plain = [
    BRAND,
    "",
    heading,
    "",
    ...lines,
    ...(action ? ["", `${action.label}: ${action.url}`] : []),
    ...(footer ? ["", footer] : []),
  ].join("\n");

  return { subject, html, text: plain };
}

function escape(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

/**
 * Заголовки безопасности (docs/SECURITY.md, S-G1). Отдаются из
 * `next.config.ts` на все ответы; страница экрана `/r/<code>/tv` получает
 * свою CSP — без запрета встраивания.
 *
 * **CSP без nonce, со `'unsafe-inline'` для скриптов.** Next вставляет в
 * страницу встроенные скрипты (данные RSC), и есть наш — `COVER_IN_STANDALONE`
 * в `layout.tsx`. Nonce требует динамической отрисовки каждой страницы, а
 * хеши (SRI) в этой версии Next — экспериментальные. Компромисс записан в
 * SECURITY.md. Но и такая CSP закрывает главное: скрипты, соединения, картинки
 * и шрифты с чужих доменов, `<object>`, подмену `<base>`, отправку форм
 * наружу и встраивание нашего сайта в чужой фрейм.
 *
 * `connect-src 'self'` покрывает и вебсокет на тот же адрес — так читают
 * CSP3 все нынешние браузеры.
 */

type Header = { key: string; value: string };

function csp(options: { dev: boolean; frameable: boolean }): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${options.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Экран встраивают в OBS и в оверлеи трансляции — ему фреймы можно.
    options.frameable ? "" : "frame-ancestors 'none'",
  ];
  return directives.filter(Boolean).join("; ");
}

/** Заголовки для всех ответов. */
export function commonSecurityHeaders(dev: boolean): Header[] {
  return [
    { key: "Content-Security-Policy", value: csp({ dev, frameable: false }) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    // Браузер запоминает: только HTTPS, год. На локальном http его
    // игнорируют — там и мешать нечему.
    { key: "Strict-Transport-Security", value: "max-age=31536000" },
  ];
}

/** Страница экрана: та же CSP, но встраивать можно. */
export function screenSecurityHeaders(dev: boolean): Header[] {
  return [
    { key: "Content-Security-Policy", value: csp({ dev, frameable: true }) },
  ];
}

/**
 * Куда можно вернуть человека по параметру `next`: только внутрь сайта
 * (docs/SECURITY.md, S-B4).
 *
 * Раньше проверка была «начинается с `/`, но не с `//`». Она пропускала
 * `/\evil.com`: браузер читает обратный слэш как прямой, и после настоящего
 * входа человек уезжал на чужой домен — готовая заготовка для фишинга. Такие
 * проверки по строке всегда отстают от того, как браузер разбирает адрес,
 * поэтому здесь адрес разбирается так же, как в браузере, — через `URL`, — и
 * принимается только тот, что остался на нашем origin.
 *
 * Функция одна на экшены и `proxy.ts`: две проверки одного и того же рано или
 * поздно разъезжаются.
 */

/** Условный origin для разбора: важен не он сам, а то, что путь от него не ушёл. */
const HERE = "http://here.invalid";

/**
 * Путь внутри сайта или `null`. Возвращает `pathname + search + hash` —
 * без origin, чтобы результат можно было отдать и в `redirect`, и в
 * `NextResponse.redirect` поверх своего адреса.
 */
export function safeInternalPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;

  // Обратный слэш и управляющие символы в пути нашему сайту не нужны, а
  // браузеры по-разному с ними обращаются: `/\evil.com`, `/\t/evil.com`.
  if (hasUnsafeChars(value)) return null;

  let url: URL;
  try {
    url = new URL(value, HERE);
  } catch {
    return null;
  }

  if (url.origin !== HERE) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Обратный слэш или управляющий символ (коды 0–31 и 127). */
function hasUnsafeChars(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (char === "\\" || code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

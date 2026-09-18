import type { IncomingHttpHeaders } from "node:http";

/**
 * Адрес клиента — ключ для лимитов «с одного адреса» (docs/SECURITY.md, S-R2).
 *
 * За Caddy приложение видит адрес прокси, а не игрока. Настоящий адрес Caddy
 * кладёт в `X-Forwarded-For`. Доверять заголовку можно ровно потому, как
 * устроена выкладка:
 *
 * - Caddy 2 не верит входящему `X-Forwarded-For` от непроверенных источников и
 *   перезаписывает его адресом, с которого пришёл запрос;
 * - приложение опубликовано только на `127.0.0.1` машины и в сети compose,
 *   поэтому запрос мимо Caddy может прийти только с самой машины.
 *
 * Если поверх Caddy встанет ещё один прокси или порт приложения откроют
 * наружу, это правило надо пересмотреть — записано в docs/DEPLOY.md.
 *
 * Берём **самый правый** адрес цепочки: его дописал ближайший к нам прокси.
 * Всё, что левее, мог вписать сам клиент.
 */

/** Адрес, когда узнать его не из чего. Все такие запросы делят один счётчик. */
export const UNKNOWN_ADDRESS = "unknown";

/**
 * Адрес из заголовка `X-Forwarded-For` и адреса соединения. Заголовок
 * главнее: соединение за прокси всегда приходит от прокси.
 */
export function pickAddress(
  forwardedFor: string | string[] | null | undefined,
  remote: string | null | undefined,
): string {
  const header = Array.isArray(forwardedFor)
    ? forwardedFor.join(",")
    : (forwardedFor ?? "");

  const chain = header
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");

  return normalize(chain.at(-1) ?? remote ?? "") || UNKNOWN_ADDRESS;
}

/** Адрес для сокета: заголовки рукопожатия и адрес соединения. */
export function socketAddress(handshake: {
  headers: IncomingHttpHeaders;
  address: string;
}): string {
  return pickAddress(handshake.headers["x-forwarded-for"], handshake.address);
}

/**
 * Один адрес — одна запись. IPv4, пришедший через IPv6-сокет
 * (`::ffff:1.2.3.4`), — это тот же `1.2.3.4`: иначе у одного клиента было бы
 * два счётчика.
 */
function normalize(address: string): string {
  const trimmed = address.trim().toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(trimmed);
  return mapped?.[1] ?? trimmed;
}

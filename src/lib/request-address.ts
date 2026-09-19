import { headers } from "next/headers";
import { pickAddress } from "../server/client-address";

/**
 * Адрес клиента для серверного экшена и страницы — ключ лимитов «с одного
 * адреса» (docs/SECURITY.md, S-R2). Правило, чему тут верить, — в
 * `src/server/client-address.ts`.
 *
 * Адреса соединения `headers()` не отдаёт, но он и не нужен: если прокси
 * заголовок не поставил, Next сам кладёт в `X-Forwarded-For` адрес сокета.
 */
export async function requestAddress(): Promise<string> {
  const list = await headers();
  return pickAddress(list.get("x-forwarded-for"), null);
}

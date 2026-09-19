import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Сравнить секрет за постоянное время (docs/SECURITY.md, S-G2).
 *
 * Обычное `!==` выходит на первом несовпавшем символе, и по времени ответа
 * ключ можно подбирать посимвольно. Обе строки сначала хешируются: так
 * сравниваются буферы одной длины, и длина ключа тоже не утекает.
 */
export function sameSecret(given: unknown, expected: string): boolean {
  if (typeof given !== "string") return false;

  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

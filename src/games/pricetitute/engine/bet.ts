/**
 * Ставка игрока и ответ ведущего (см. src/games/pricetitute/docs/SPEC.md §5.1).
 *
 * Число — сумма в рублях, 0 означает «Бесплатно». Отдельное значение "never" —
 * «Ни за какие деньги». Строкой, а не Infinity: бесконечность не переживает
 * JSON и не ложится в базу.
 */

export const NEVER = "never";
export type Never = typeof NEVER;

export type Bet = number | Never;

export const MIN_SUM = 0;
export const MAX_SUM = 1_000_000_000;

export function isNever(bet: Bet): bet is Never {
  return bet === NEVER;
}

/**
 * Разбор ставки, пришедшей от клиента. Всё, что не целое число в допустимых
 * границах и не "never", отбрасывается.
 */
export function parseBet(input: unknown): Bet | null {
  if (input === NEVER) return NEVER;

  const value = typeof input === "string" ? Number(input) : input;
  if (typeof value !== "number") return null;
  if (!Number.isInteger(value)) return null;
  if (value < MIN_SUM || value > MAX_SUM) return null;

  return value;
}

/** Человекочитаемая ставка для интерфейса и логов. */
export function formatBet(bet: Bet): string {
  if (isNever(bet)) return "Ни за какие деньги";
  if (bet === 0) return "Бесплатно";
  return `${bet.toLocaleString("ru-RU")} ₽`;
}

/** Представление ставки для базы: сумма или флаг отказа. */
export function toStorage(bet: Bet): { sum: number | null; never: boolean } {
  return isNever(bet) ? { sum: null, never: true } : { sum: bet, never: false };
}

export function fromStorage(stored: {
  sum: number | null;
  never: boolean;
}): Bet {
  return stored.never ? NEVER : (stored.sum ?? 0);
}

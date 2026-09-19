import { RateLimiter } from "./rate-limit";

/**
 * Журнал событий безопасности (docs/SECURITY.md, S-H1).
 *
 * Одна строка на событие: `[безопасность] событие {"поле":"значение"}`. Метка в
 * начале — чтобы вынуть журнал из `docker compose logs` одной командой,
 * JSON — чтобы строку можно было разобрать скриптом.
 *
 * Что сюда нельзя: пароли, токены, ключи экрана, ссылки из писем — никогда;
 * адрес почты — только через `maskAddress`. Адрес клиента пишется: без него
 * журнал не отличит атаку с одного места от толпы.
 *
 * Отказы по лимитам пишутся с приглушением: не больше трёх строк в минуту на
 * событие и ключ (обычно — адрес). Иначе сама атака завалила бы журнал, и в
 * нём нельзя было бы найти ничего другого. Штучные события — смена почты,
 * пароля, выход везде — пишутся всегда.
 */

export type SecurityFields = Record<
  string,
  string | number | boolean | null | undefined
>;

/** Строка журнала. Отдельно от вывода — чтобы проверять формат тестом. */
export function formatSecurityLine(
  event: string,
  fields: SecurityFields = {},
): string {
  const clean = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
  const tail = Object.keys(clean).length > 0 ? ` ${JSON.stringify(clean)}` : "";
  return `[безопасность] ${event}${tail}`;
}

const throttle = new RateLimiter(3, 60_000);

/**
 * Записать событие. `quietKey` — ключ приглушения: с ним строк по этому
 * событию и ключу не больше трёх в минуту.
 */
export function securityLog(
  event: string,
  fields: SecurityFields = {},
  quietKey?: string,
): void {
  if (quietKey !== undefined && !throttle.allow(`${event}|${quietKey}`)) return;
  console.warn(formatSecurityLine(event, fields));
}

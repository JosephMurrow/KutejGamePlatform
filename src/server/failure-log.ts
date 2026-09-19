/**
 * Журнал сбоев по уровням (docs/SECURITY.md, S-E4).
 *
 * - `1` — внешний сбой: база, почта, Твич, Stockfish. Наше состояние цело,
 *   работаем дальше без упавшей части.
 * - `2` — сбой одной комнаты: исключение из движка игры. Комнату закрываем,
 *   остальные не задеты.
 * - `3` — сбой платформы или непонятно чего: всё, что долетело до
 *   `uncaughtException`. Процесс не перезапускается — решено хозяином; о
 *   сбое узнают по метке в логе, а канал оповещения хозяину ещё выбирается.
 *
 * Уровень 0 — отказ клиенту (`{ accepted: false }`) — сбоем не считается и
 * сюда не пишется.
 *
 * Строка: `[сбой:N] где {поля}` и следом стек — чтобы считать сбои по
 * `docker compose logs` одной командой: `grep '\[сбой:'`.
 */

export type FailureLevel = 1 | 2 | 3;

export function formatFailure(
  level: FailureLevel,
  where: string,
  fields: Record<string, string | number | null | undefined> = {},
): string {
  const clean = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
  const tail = Object.keys(clean).length > 0 ? ` ${JSON.stringify(clean)}` : "";
  return `[сбой:${level}] ${where}${tail}`;
}

export function logFailure(
  level: FailureLevel,
  where: string,
  error: unknown,
  fields: Record<string, string | number | null | undefined> = {},
): void {
  console.error(formatFailure(level, where, fields), error);
}

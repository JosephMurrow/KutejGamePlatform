import { RateLimiter } from "../../server/rate-limit";

/**
 * Сторож входа (docs/SECURITY.md, S-B1).
 *
 * Два счётчика, и оба нужны:
 *
 * - **по логину** — неудачи подряд на один аккаунт. Он останавливает перебор
 *   пароля к конкретному человеку, откуда бы ни шли попытки;
 * - **по адресу** — все попытки с одного адреса, удачные и нет. Он
 *   останавливает перебор по многим логинам сразу и поток запросов, каждый из
 *   которых гоняет argon2 на процессоре, где крутятся партии.
 *
 * Проверка идёт **до** argon2: иначе отказ приходил бы уже после дорогой
 * работы, и DoS остался бы на месте. Удачный вход обнуляет счётчик логина —
 * человек, наконец вспомнивший пароль, не должен ждать.
 *
 * Отказ одинаковый для существующего логина и выдуманного: по нему нельзя
 * узнать, какие логины заняты. Считаем неудачи по введённому логину, а не по
 * найденному аккаунту, — ровно поэтому.
 */

/** Неудач на один логин за окно. */
export const LOGIN_FAILURES = 10;
/** Попыток с одного адреса за окно — на все логины вместе. */
export const ADDRESS_ATTEMPTS = 30;
/** Окно обоих счётчиков. */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export class LoginGuard {
  private readonly failures: RateLimiter;
  private readonly attempts: RateLimiter;

  constructor(
    limits: { failures: number; attempts: number; windowMs: number } = {
      failures: LOGIN_FAILURES,
      attempts: ADDRESS_ATTEMPTS,
      windowMs: LOGIN_WINDOW_MS,
    },
  ) {
    this.failures = new RateLimiter(limits.failures, limits.windowMs);
    this.attempts = new RateLimiter(limits.attempts, limits.windowMs);
  }

  /**
   * Можно ли проверять пароль. `true` — пускаем и засчитываем попытку адресу;
   * `false` — отказ, argon2 не запускается.
   */
  admit(login: string, address: string, now = Date.now()): boolean {
    if (this.failures.blocked(login, now)) return false;
    return this.attempts.allow(address, now);
  }

  /** Пароль не подошёл. */
  failed(login: string, now = Date.now()): void {
    this.failures.hit(login, now);
  }

  /** Вошёл — неудачи этого логина забываются. */
  succeeded(login: string): void {
    this.failures.forget(login);
  }
}

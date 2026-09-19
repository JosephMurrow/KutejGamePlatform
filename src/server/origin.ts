import type { IncomingHttpHeaders } from "node:http";

/**
 * Откуда пришло подключение сокета (docs/SECURITY.md, S-E3).
 *
 * Браузер шлёт cookie сессии и на сокет, открытый чужой страницей, — так чужой
 * сайт мог бы играть от имени зашедшего к нему игрока. От этого сейчас
 * спасает `SameSite=Lax`, но держаться на одной настройке cookie не стоит.
 * Браузер при этом всегда присылает заголовок `Origin`, и подделать его
 * страница не может, — по нему и отсекаем.
 *
 * Сверяем не только с `APP_URL`, но и с самим запросом: `Origin` должен
 * совпадать с `Host`, как Next проверяет серверные экшены. Так проверка
 * работает и за Caddy (он передаёт исходный `Host`), и на локальном сервере
 * на любом порту.
 *
 * Без `Origin` пропускаем: его нет только у небраузерных клиентов — смоуков,
 * скриптов, — а подключиться с чужой cookie они могут и так, если она у них
 * есть; атаке через чужой сайт нужен браузер жертвы, а он `Origin` пришлёт.
 */
export function originAllowed(
  headers: IncomingHttpHeaders,
  appUrl: string,
): boolean {
  const origin = headers.origin;
  if (origin === undefined || origin === "") return true;

  let from: URL;
  try {
    from = new URL(origin);
  } catch {
    return false;
  }

  // Прокси может передать исходный хост отдельным заголовком.
  const forwarded = headers["x-forwarded-host"];
  const hosts = [
    headers.host,
    typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined,
  ].filter((host): host is string => !!host);

  if (hosts.includes(from.host)) return true;

  try {
    return new URL(appUrl).origin === from.origin;
  } catch {
    return false;
  }
}

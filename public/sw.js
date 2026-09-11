/*
 * Служебный воркер (docs/BACKLOG.md D1).
 *
 * Задача у него ровно одна, и она не про офлайн: без обработчика `fetch`
 * андроид не предложит установку сам и не даст работать кнопке «Установить».
 * Для самой установки воркер не нужен ни на одной платформе — айфон его
 * никогда не требовал, Chrome убрал это требование из условий.
 *
 * Поэтому он не кеширует ничего, кроме страницы «нет сети». Это игра на
 * сокете: состояние раунда живёт в памяти процесса, часы синхронизируются с
 * сервером, и показать сохранённый раунд — хуже, чем честно сказать, что связи
 * нет.
 *
 * Файл лежит в `public` и в сборку не попадает: правится руками, версия
 * поднимается руками.
 */

/* Поднимать при каждой правке этого файла. */
const VERSION = "1";
const CACHE = `offline-v${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // `cache: "reload"` — чтобы страница легла свежей, а не из HTTP-кеша
      // браузера: иначе в кеш воркера уедет прошлая её версия.
      .then((cache) =>
        cache.add(new Request(OFFLINE_URL, { cache: "reload" })),
      ),
  );

  /*
   * Не ждём, пока закроются все вкладки. Обычно `skipWaiting` опасен: страница,
   * загруженная старой сборкой, начинает получать куски новой и падает. Здесь
   * этой опасности нет — воркер не раздаёт ничего, кроме страницы «нет сети».
   *
   * Зато есть противоположная: в установленном приложении вкладки не закрывают
   * неделями, и без этой строчки новый воркер не встанет никогда.
   */
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      /*
       * Без предзагрузки навигации воркер добавляет задержку к каждому
       * переходу: браузер ждёт, пока он проснётся, и только потом идёт в сеть.
       */
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
      );

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  /*
   * Всё, кроме перехода по адресу, отдаём браузеру нетронутым: рукопожатие
   * socket.io, полезную нагрузку RSC, действия сервера, ответы с сессией.
   *
   * Рукопожатие — главная мина. Вебсокет мимо воркера проходит, и на этом
   * обычно успокаиваются, но socket.io начинает не с вебсокета, а с обычного
   * HTTP-опроса, и вот его воркер увидел бы. Закешированный ответ рукопожатия —
   * партия, которая разваливается через раз и не воспроизводится никогда.
   */
  if (request.mode !== "navigate") return;

  /* Отдельной строкой на случай, если условие выше когда-нибудь ослабят. */
  if (new URL(request.url).pathname.startsWith("/socket.io")) return;

  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;

        return await fetch(request);
      } catch {
        const cache = await caches.open(CACHE);
        const offline = await cache.match(OFFLINE_URL);

        return offline ?? Response.error();
      }
    })(),
  );
});

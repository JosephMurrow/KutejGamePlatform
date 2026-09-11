"use client";

import { useEffect } from "react";

/**
 * Регистрация служебного воркера (docs/BACKLOG.md D1).
 *
 * Сам воркер — `public/sw.js`. Зачем он вообще нужен, написано там же: ради
 * кнопки «Установить» на андроиде, а не ради офлайна.
 *
 * Только в проде. В разработке от него один вред: правки прилетают горячей
 * перезагрузкой, а воркер живёт своей жизнью и переживает перезапуск сервера.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      void navigator.serviceWorker
        .register("/sw.js", {
          scope: "/",
          /*
           * Запрещает браузеру брать сам `sw.js` из HTTP-кеша. Без этого на
           * старом воркере можно застрять на сутки — вторая половина той же
           * защиты стоит заголовком в `next.config.ts`.
           */
          updateViaCache: "none",
        })
        .catch((error: unknown) => {
          console.error("Служебный воркер не зарегистрировался:", error);
        });
    };

    /*
     * После загрузки страницы, а не во время: регистрация тянет за собой
     * скачивание воркера и установку, и на медленной связи это отняло бы
     * пропускную способность у самой страницы.
     */
    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}

import type { Metadata } from "next";
import { PLATFORM } from "@/lib/brand";

export const metadata: Metadata = { title: `Нет связи — ${PLATFORM}` };

/**
 * Страница «нет сети» (docs/BACKLOG.md D2).
 *
 * Её кладёт в кеш служебный воркер и отдаёт, когда переход по адресу не
 * удался. Во вкладке браузера ошибку рисует сам браузер, и видно, что это он;
 * в приложении без рамки та же ошибка на весь экран читается как «приложение
 * сломалось».
 *
 * Стили здесь встроенные, а картинок нет вовсе — намеренно, по той же причине,
 * что и в `global-error.tsx`. Отдаётся эта страница как раз тогда, когда сети
 * нет: внешний файл стилей с хешем в имени взять будет неоткуда, и страница о
 * потерянной связи сама выглядела бы поломкой. Значения повторяют палитру
 * платформы.
 *
 * Ни одного обращения к базе: то, что лежит в кеше, обязано открываться без
 * сервера вообще.
 */
export default function OfflinePage() {
  return (
    <main
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.25rem",
        padding: "4rem 1.5rem",
        textAlign: "center",
        color: "#f3eeff",
      }}
    >
      <p style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
        Кут<span style={{ color: "#c9a2ff" }}>ёж</span>
      </p>

      <div>
        <h1 style={{ fontSize: "1.125rem", margin: 0 }}>Нет связи</h1>
        <p
          style={{
            maxWidth: "24rem",
            margin: "0.5rem auto 0",
            color: "#cabfe2",
            fontSize: "0.875rem",
          }}
        >
          Интернет пропал, а без него здесь нечего показать: игра живёт вживую —
          раунды, ставки и чат идут на сервере.
        </p>
      </div>

      {/*
        Обычная ссылка, а не `Link`: переход внутри приложения тут бесполезен,
        нужна именно новая попытка сходить в сеть. Ссылка, а не кнопка, —
        чтобы работать и без единого куска JavaScript: офлайн они могут не
        доехать.
      */}
      <a
        href="/games"
        style={{
          borderRadius: "0.5rem",
          background: "#c9a2ff",
          color: "#241640",
          padding: "0.65rem 1.25rem",
          fontSize: "0.875rem",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Попробовать снова
      </a>
    </main>
  );
}

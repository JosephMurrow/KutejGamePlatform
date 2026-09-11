"use client";

import { useEffect } from "react";

/**
 * Последний рубеж: сюда попадают ошибки самого корневого макета, когда
 * обычный error.tsx отрисовать уже негде. Поэтому здесь свой html и никаких
 * общих компонентов — они могут быть как раз тем, что сломалось.
 */
/*
 * Цвета здесь числами намеренно: global-error подменяет корневой layout, а с
 * ним и подключение globals.css, — переменных темы на этой странице нет.
 * Значения повторяют палитру платформы.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Приложение упало целиком:", error);
  }, [error]);

  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          background: "#453466",
          color: "#f3eeff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>
          Кут<span style={{ color: "#c9a2ff" }}>ёж</span>
        </p>
        <h1 style={{ fontSize: "1.125rem", margin: 0 }}>
          Приложение не запустилось
        </h1>
        <p style={{ maxWidth: "24rem", color: "#cabfe2", margin: 0 }}>
          Это уже наша поломка, а не твоя. Попробуй обновить страницу.
        </p>
        {/*
          Сюда попадают, когда не отрисовался сам корневой макет, и `reset`
          здесь — самая слабая надежда из возможных: перерисовывать нечего.
          Поэтому первой стоит настоящая перезагрузка страницей, а не
          перерисовка (docs/BACKLOG.md C1).

          В установленном приложении это единственный выход: ни жеста
          обновления, ни адресной строки там нет.
        */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: 0,
              borderRadius: "0.5rem",
              background: "#c9a2ff",
              color: "#241640",
              padding: "0.65rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Обновить страницу
          </button>
          <button
            type="button"
            onClick={reset}
            style={{
              borderRadius: "0.5rem",
              border: "1px solid #6c5a9c",
              background: "transparent",
              color: "#f3eeff",
              padding: "0.65rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Попробовать снова
          </button>
        </div>
      </body>
    </html>
  );
}

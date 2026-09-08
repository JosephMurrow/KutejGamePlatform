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
        <button
          type="button"
          onClick={reset}
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
          Обновить
        </button>
      </body>
    </html>
  );
}

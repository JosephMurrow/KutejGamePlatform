"use client";

import type { ReactNode } from "react";

/*
 * Кнопки-иконки шапки комнаты — копией у шахмат
 * (src/games/chess/components/GameRoom.tsx): тот же вид, что у выхода на
 * витрину, который платформа рисует чуть выше. Игра не импортирует игру.
 */

/**
 * Кнопка-иконка в шапке: тот же вид, что у выхода на витрину, который платформа
 * рисует чуть выше. Подпись всплывает и на наведении, и на фокусе с
 * клавиатуры — иначе идущий табом видит голую иконку.
 */
export function IconButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="group relative w-fit">
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        className="flex size-9 items-center justify-center rounded-xl border border-line bg-paper text-muted transition hover:border-accent hover:text-accent"
      >
        {children}
      </button>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-full z-40 mt-1.5 whitespace-nowrap rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs text-muted opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {label}
      </span>
    </div>
  );
}

/** Динамик: со звуковыми волнами или перечёркнутый. */
export function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path
        d="M4 8h2.5L10 5v10L6.5 12H4z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {on ? (
        <>
          <path
            d="M12.6 7.4a3.6 3.6 0 0 1 0 5.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path
            d="M14.8 5.2a6.8 6.8 0 0 1 0 9.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </>
      ) : (
        <path
          d="M13 8l4 4m0-4l-4 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** Две стрелки по кругу: доска поворачивается другой стороной. */
export function FlipIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path
        d="M5.5 7.5A5 5 0 0 1 15 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M14.5 12.5A5 5 0 0 1 5 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M15.4 5.2v3h-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.6 14.8v-3h3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

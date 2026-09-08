"use client";

import { useEffect, useState } from "react";

/**
 * Обратный отсчёт по серверному дедлайну. Часы клиента врут, поэтому
 * оставшееся время считается с поправкой на разницу с сервером.
 */
export function Countdown({
  deadline,
  durationMs,
  clockOffset,
  urgent = false,
  big = false,
}: {
  deadline: number | null;
  durationMs: number | null;
  clockOffset: number;
  /** Подсветить, когда времени в обрез: для коротких фаз ведущего. */
  urgent?: boolean;
  /** Крупный вариант — для вида «экран»: его читают с дивана, а не с руки. */
  big?: boolean;
}) {
  // Хранить оставшееся время в состоянии незачем: тикаем счётчиком, а само
  // значение считается на рендере — так оно не расходится с пропсами.
  const [, tick] = useState(0);

  useEffect(() => {
    if (deadline === null) return;

    const timer = setInterval(() => tick((value) => value + 1), 200);
    return () => clearInterval(timer);
  }, [deadline]);

  if (deadline === null) return null;

  const remaining = left(deadline, clockOffset);

  const share = durationMs ? Math.min(1, remaining / durationMs) : 0;
  const low = urgent || remaining <= 5000;

  return (
    <div className={`flex items-center ${big ? "gap-5" : "gap-3"}`}>
      <span
        className={`tabular font-semibold ${big ? "text-3xl" : "text-sm"} ${
          low ? "text-accent" : "text-muted"
        }`}
      >
        {format(remaining)}
      </span>
      <div
        className={`${big ? "h-3" : "h-1.5"} flex-1 overflow-hidden rounded-full bg-tint`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-200 ease-linear ${
            low ? "bg-accent" : "bg-accent-soft"
          }`}
          style={{ width: `${share * 100}%` }}
        />
      </div>
    </div>
  );
}

function left(deadline: number | null, clockOffset: number): number {
  if (deadline === null) return 0;
  return Math.max(0, deadline - (Date.now() + clockOffset));
}

function format(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  if (minutes === 0) return `${seconds} с`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

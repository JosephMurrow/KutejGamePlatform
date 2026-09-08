"use client";

import { useState } from "react";
import { MAX_SUM, NEVER, type Bet } from "@/lib/game/bet";

const PRESETS = [1_000, 10_000, 100_000, 1_000_000];

/**
 * Ввод суммы: цифры с разделителями разрядов плюс две кнопки по краям шкалы —
 * «Бесплатно» и «Ни за какие деньги» (см. src/games/pricetitute/docs/SPEC.md §5.1).
 *
 * На телефоне всё намеренно ниже и уже: поле поменьше, пресеты одной лентой,
 * крайние кнопки в строку. Раньше это были пять этажей, и последний уезжал под
 * нижнюю панель браузера вместе с половиной вариантов ответа.
 */
export function BetInput({
  submitLabel,
  onSubmit,
  disabled = false,
}: {
  submitLabel: string;
  onSubmit: (bet: Bet) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);

  const amount = digits === "" ? null : Number(digits);
  const overflow = amount !== null && amount > MAX_SUM;
  const canSubmit = !disabled && !busy && amount !== null && !overflow;

  async function send(bet: Bet) {
    if (disabled || busy) return;
    setBusy(true);
    try {
      await onSubmit(bet);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="relative">
        <input
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={group(digits)}
          disabled={disabled || busy}
          onChange={(event) =>
            setDigits(event.target.value.replace(/\D/g, "").slice(0, 13))
          }
          className={`tabular w-full rounded-xl border bg-blush py-3 pl-4 pr-11 text-right text-2xl font-semibold outline-none transition disabled:opacity-60 sm:py-4 sm:pr-12 sm:text-3xl ${
            overflow ? "border-crimson" : "border-line focus:border-crimson"
          }`}
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xl text-muted sm:text-2xl">
          ₽
        </span>
      </div>

      {overflow && (
        <p className="text-xs text-crimson">
          Больше миллиарда ставить нельзя — это уже не про деньги
        </p>
      )}

      <div className="flex gap-2 overflow-x-auto">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={disabled || busy}
            onClick={() => setDigits(String(preset))}
            className="tabular shrink-0 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm transition hover:border-crimson hover:text-crimson disabled:opacity-60"
          >
            {preset.toLocaleString("ru-RU")}
          </button>
        ))}
        {digits !== "" && (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => setDigits("")}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-muted transition hover:text-crimson disabled:opacity-60"
          >
            Стереть
          </button>
        )}
      </div>

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => void send(amount ?? 0)}
        className="rounded-xl bg-crimson px-4 py-3 font-semibold text-paper transition hover:bg-deep disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitLabel}
      </button>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void send(0)}
          className="flex-1 rounded-xl border border-line bg-paper px-3 py-2.5 text-sm font-medium transition hover:border-gold hover:text-gold disabled:opacity-60 sm:px-4"
        >
          Бесплатно
        </button>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void send(NEVER)}
          className="flex-1 rounded-xl border border-line bg-paper px-3 py-2.5 text-sm font-medium transition hover:border-crimson hover:text-crimson disabled:opacity-60 sm:px-4"
        >
          Ни за какие деньги
        </button>
      </div>
    </div>
  );
}

/** Разряды пробелами: 1000000 → 1 000 000. */
function group(digits: string): string {
  if (digits === "") return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

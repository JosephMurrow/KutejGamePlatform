"use client";

import type { ChessColor } from "../protocol";

/**
 * Во что превратить пешку.
 *
 * Выбор из четырёх, а не молчаливый ферзь: недопревращение в коня с шахом
 * решает партии, а в ладью — спасает от пата. Отмена обязана откатывать ход,
 * иначе фигура зависает в воздухе (src/games/chess/docs/BACKLOG.md B3).
 */

export type PromotionChoice = "q" | "r" | "b" | "n";

const CHOICES: { kind: PromotionChoice; label: string }[] = [
  { kind: "q", label: "Ферзь" },
  { kind: "r", label: "Ладья" },
  { kind: "b", label: "Слон" },
  { kind: "n", label: "Конь" },
];

export function Promotion({
  color,
  onChoose,
  onCancel,
}: {
  color: ChessColor;
  onChoose: (choice: PromotionChoice) => void;
  onCancel: () => void;
}) {
  const prefix = color === "white" ? "w" : "b";

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-ink/45 backdrop-blur-[1px]"
      // Клик мимо — та же отмена: диалог не должен запирать доску.
      onClick={onCancel}
    >
      <div
        className="flex flex-col gap-3 rounded-2xl border border-line bg-paper p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-center text-sm font-semibold">
          Во что превращаем
        </div>

        <div className="flex gap-2">
          {CHOICES.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              onClick={() => onChoose(kind)}
              title={label}
              aria-label={label}
              className="flex size-16 items-center justify-center rounded-xl border border-line bg-surface transition hover:border-accent hover:bg-tint"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/games/chess/pieces/${prefix}${kind}.png`}
                alt=""
                className="size-14 object-contain"
              />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold text-muted transition hover:text-accent"
        >
          Отменить ход
        </button>
      </div>
    </div>
  );
}

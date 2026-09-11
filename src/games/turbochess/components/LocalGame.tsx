"use client";

import { useReducer, useState } from "react";
import { TurboGame, type MoveInput } from "../engine/game";
import { REASON_TEXT, type Outcome } from "../engine/outcome";
import { Board } from "./Board";
import { useSound } from "./sound";

/**
 * Партия за одним экраном: ходы за обе стороны, запись, ход назад.
 *
 * Это не режим игры, а ступень стройки: сетевой партии ещё нет
 * (docs/PLAN.md, этап 5), а доску надо проверить на настоящих правилах уже
 * сейчас. Когда партия пойдёт по сети, доска останется та же — сменится
 * только тот, кто принимает ход.
 */

const SIDE = ["белые", "чёрные"] as const;

/** Итог человеческими словами: причина, потом кто выиграл. */
function verdict(outcome: Outcome): string {
  const reason = REASON_TEXT[outcome.reason];
  const head = `${reason.charAt(0).toUpperCase()}${reason.slice(1)}`;

  return outcome.result === "draw"
    ? `${head}. Ничья.`
    : `${head}. Выиграли ${SIDE[outcome.result] ?? "другие"}.`;
}

export function LocalGame() {
  // Партия держит свою историю сама, и копировать её на каждый ход незачем:
  // после хода достаточно перерисоваться.
  const [game, setGame] = useState(() => new TurboGame());
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const [flipped, setFlipped] = useState(false);
  const sound = useSound();

  const outcome = game.outcome();
  const position = game.position();
  const claimable = game.claimableDraw();
  const history = game.history();
  const check = game.moves().at(-1)?.check ?? false;

  function move(input: MoveInput): boolean {
    const result = game.move(input, game.ply());
    if (!result.ok) return false;

    redraw();
    sound.play(
      result.outcome
        ? "end"
        : result.move.check
          ? "check"
          : result.move.captured
            ? "capture"
            : "move",
    );
    return true;
  }

  function act(done: boolean) {
    if (done) redraw();
  }

  return (
    <div className="flex w-full flex-col items-center gap-5 lg:flex-row lg:items-start lg:justify-center lg:gap-8">
      <div className="w-full max-w-[560px]">
        <Board
          position={position}
          controls={outcome ? [] : [0, 1]}
          lastMove={game.lastMove()}
          flipped={flipped}
          onMove={move}
        />
      </div>

      <aside className="flex w-full max-w-[560px] flex-col gap-4 lg:w-72">
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper p-4">
          <p className="text-sm font-semibold" aria-live="polite">
            {outcome
              ? verdict(outcome)
              : `Ходят ${SIDE[position.turn] ?? "другие"}${check ? " — шах" : ""}`}
          </p>

          {claimable && !outcome ? (
            <button
              type="button"
              onClick={() => act(game.claimDraw() !== null)}
              className="w-fit rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-surface transition hover:bg-deep"
            >
              Потребовать ничью:{" "}
              {claimable === "threefold" ? "повторение" : "пятьдесят ходов"}
            </button>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => act(game.undo())}
              disabled={game.ply() === 0 || outcome !== null}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium transition hover:border-accent disabled:opacity-40 disabled:hover:border-line"
            >
              Ход назад
            </button>
            <button
              type="button"
              onClick={() => setGame(new TurboGame())}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium transition hover:border-accent"
            >
              Заново
            </button>
            <button
              type="button"
              onClick={() => setFlipped((value) => !value)}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium transition hover:border-accent"
            >
              Перевернуть
            </button>
            <button
              type="button"
              onClick={sound.toggle}
              aria-pressed={sound.on}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium transition hover:border-accent"
            >
              Звук: {sound.on ? "вкл" : "выкл"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-paper p-4">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            Ходы
          </h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted">Пока ни одного.</p>
          ) : (
            <ol className="grid max-h-64 grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 overflow-y-auto text-sm">
              {Array.from(
                { length: Math.ceil(history.length / 2) },
                (_, index) => (
                  <li key={index} className="contents">
                    <span className="tabular text-muted">{index + 1}.</span>
                    <span className="tabular">{history[index * 2]}</span>
                    <span className="tabular">
                      {history[index * 2 + 1] ?? ""}
                    </span>
                  </li>
                ),
              )}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}

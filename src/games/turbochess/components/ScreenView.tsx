"use client";

import { Countdown } from "@/components/ui/Countdown";
import { REASON_TEXT } from "../engine/outcome";
import { modeInfo } from "../modes/catalog";
import { Board } from "./Board";
import { useTurboRoom } from "./useTurboRoom";

/**
 * Вид «экран»: партия для телевизора и трансляции.
 *
 * Крупная доска, часы и ники — и ничего, чем можно управлять: экран не сидит
 * за столом и ходов не делает. Так же устроен экран шахмат.
 */

const SIDE_NAME = ["белые", "чёрные"] as const;

export function ScreenView({
  roomCode,
  screenKey,
}: {
  roomCode: string;
  screenKey: string;
}) {
  const room = useTurboRoom(roomCode, screenKey);
  const state = room.state;

  if (!state || !state.position) {
    return (
      <main className="flex flex-1 items-center justify-center p-10 text-2xl text-muted">
        Подключаемся к столу…
      </main>
    );
  }

  const name = (seat: number) =>
    state.players.find((player) => player.seat === seat)?.nickname ?? "—";

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      {state.mode ? (
        <div className="text-xl text-muted">{modeInfo(state.mode).title}</div>
      ) : null}

      <div className="flex w-full max-w-[min(80vh,900px)] items-end justify-between gap-6">
        <Name nickname={name(1)} side={SIDE_NAME[1]} />
        <Name nickname={name(0)} side={SIDE_NAME[0]} align="right" />
      </div>

      <div className="w-full max-w-[min(80vh,900px)]">
        <Board
          position={state.position}
          controls={[]}
          lastMove={state.lastMove}
          flipped={false}
          onMove={() => false}
        />
      </div>

      <div className="w-full max-w-[min(80vh,900px)]">
        {state.phase === "over" ? (
          <div className="text-center text-3xl font-semibold text-accent">
            {state.result === "draw"
              ? "Ничья"
              : state.result === null
                ? "Партия кончилась"
                : `Победили ${SIDE_NAME[state.result] ?? "другие"}`}
            <span className="ml-3 text-xl text-muted">
              {state.reason ? REASON_TEXT[state.reason] : ""}
            </span>
          </div>
        ) : state.phase === "playing" ? (
          <Countdown
            deadline={state.deadline}
            durationMs={state.phaseDurationMs}
            clockOffset={room.clockOffset}
            big
          />
        ) : (
          <div className="text-center text-2xl text-muted">Ждём игроков</div>
        )}
      </div>
    </main>
  );
}

function Name({
  nickname,
  side,
  align = "left",
}: {
  nickname: string;
  side: string;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="text-3xl font-semibold">{nickname}</div>
      <div className="text-lg text-muted">{side}</div>
    </div>
  );
}

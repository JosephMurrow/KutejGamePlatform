"use client";

import { Countdown } from "@/components/ui/Countdown";
import { REASON_TEXT } from "../engine/outcome";
import { Board } from "./Board";
import { useChessRoom } from "./useChessRoom";

/**
 * Вид «экран»: партия для телевизора и трансляции.
 *
 * Крупная доска, часы и ники — и ничего, чем можно управлять: экран не сидит
 * за столом и ходов не делает (src/games/chess/docs/BACKLOG.md F3).
 */
export function ScreenView({
  roomCode,
  screenKey,
}: {
  roomCode: string;
  screenKey: string;
}) {
  const room = useChessRoom(roomCode, screenKey);
  const state = room.state;

  if (!state) {
    return (
      <main className="flex flex-1 items-center justify-center p-10 text-2xl text-muted">
        Подключаемся к столу…
      </main>
    );
  }

  const [white, black] = state.players;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="flex w-full max-w-[min(86vh,900px)] items-end justify-between gap-6">
        <Name player={black} color="чёрные" />
        <Name player={white} color="белые" align="right" />
      </div>

      <div className="w-full max-w-[min(86vh,900px)]">
        <Board
          fen={state.fen ?? "8/8/8/8/8/8/8/8 w - - 0 1"}
          myColor={null}
          turn={state.turn}
          lastMove={state.lastMove}
          ply={state.moves.length}
          flipped={false}
          streamer={state.streamerMode}
          onMove={async () => false}
        />
      </div>

      <div className="w-full max-w-[min(86vh,900px)]">
        {state.phase === "over" ? (
          <div className="text-center text-3xl font-semibold text-accent">
            {state.result === "draw"
              ? "Ничья"
              : state.result === "white"
                ? "Победили белые"
                : "Победили чёрные"}
            <span className="ml-3 text-xl text-muted">
              {state.reason
                ? REASON_TEXT[state.reason as keyof typeof REASON_TEXT]
                : ""}
            </span>
          </div>
        ) : (
          <Countdown
            deadline={state.deadline}
            durationMs={state.phaseDurationMs}
            clockOffset={room.clockOffset}
            big
          />
        )}
      </div>
    </main>
  );
}

function Name({
  player,
  color,
  align = "left",
}: {
  player?: { nickname: string };
  color: string;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="text-3xl font-semibold">{player?.nickname ?? "—"}</div>
      <div className="text-lg text-muted">{color}</div>
    </div>
  );
}

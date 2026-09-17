"use client";

import { Countdown } from "@/components/ui/Countdown";
import { REASON_TEXT } from "../engine/outcome";
import { takenCount } from "../modes/annihilation";
import { BATTLE_SIDE_NAME } from "../modes/battle";
import {
  BINGE_RANKS,
  BINGE_RANK_LABEL,
  EFFECT_HINT,
  EFFECT_LABEL,
  effectLeft,
  effectWhom,
  shaking,
} from "../modes/binge";
import { modeInfo } from "../modes/catalog";
import { nuclearCharge, nuclearThreshold } from "../modes/nuclear";
import { rulesOf } from "../modes/rules";
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

  /**
   * Что режим показывает на экране: счёт снятых фигур у «на уничтожение» и
   * заряд у «ядерных».
   *
   * Здесь открыты обе шкалы заряда: экран смотрят зрители, и напряжение —
   * весь его смысл. Соперник за столом чужого заряда по-прежнему не видит.
   */
  const score = (seat: number): string | null => {
    if (!state.position) return null;
    if (state.mode === "ANNIHILATION") {
      return `снял фигур: ${takenCount(state.position, seat)}`;
    }
    if (state.mode === "BOOZE") {
      return `выпито: ${state.drinks[seat] ?? 0}`;
    }
    if (state.mode === "BINGE" && state.binge) {
      // Карту тянет срубивший, и зритель должен видеть, кому она выпала.
      return state.binge.by === seat ? "тянет карту" : null;
    }
    if (state.mode === "NUCLEAR") {
      const options = state.options ?? {};
      return `заряд ${nuclearCharge(state.position, seat)} из ${nuclearThreshold(options)}`;
    }
    return null;
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      {state.mode ? (
        <div className="text-xl text-muted">
          {modeInfo(state.mode).title}
          {rulesOf(state.mode, state.options ?? {}).variant
            ? ` · ${rulesOf(state.mode, state.options ?? {}).variant}`
            : ""}
        </div>
      ) : null}

      {state.phase === "setup" ? (
        <div className="text-2xl text-muted">
          Расставляются вслепую — вскроемся разом
        </div>
      ) : null}

      <div className="flex w-full max-w-[min(80vh,900px)] items-end justify-between gap-6">
        {state.seats > 2 ? (
          // Вчетвером имена идут по кругу, как и ход: юг, запад, север, восток.
          Array.from({ length: state.seats }, (_, seat) => (
            <Name
              key={seat}
              nickname={name(seat)}
              side={BATTLE_SIDE_NAME[seat] ?? ""}
              score={score(seat)}
            />
          ))
        ) : (
          <>
            <Name nickname={name(1)} side={SIDE_NAME[1]} score={score(1)} />
            <Name
              nickname={name(0)}
              side={SIDE_NAME[0]}
              score={score(0)}
              align="right"
            />
          </>
        )}
      </div>

      {state.binge ? (
        <div className="flex w-full max-w-[min(80vh,900px)] flex-col items-center gap-2 rounded-2xl border border-accent bg-tint px-6 py-5 text-center">
          <span className="text-lg text-muted">
            {BINGE_RANK_LABEL[state.binge.event.rank]}
          </span>
          <span className="text-4xl font-extrabold text-accent">
            {state.binge.event.title}
          </span>
          <span className="text-xl text-muted">
            {state.binge.miss
              ? "Мимо: событию тут нечего делать"
              : state.binge.event.text}
          </span>
        </div>
      ) : null}

      {state.bingeLeft ? (
        <div className="flex w-full max-w-[min(80vh,900px)] justify-between gap-4 text-lg text-muted">
          {BINGE_RANKS.map((rank) => (
            <span key={rank}>
              {BINGE_RANK_LABEL[rank]}:{" "}
              <span className="tabular font-semibold text-ink">
                {state.bingeLeft?.[rank] ?? 0}
              </span>
            </span>
          ))}
        </div>
      ) : null}

      {state.position.effects.length > 0 ? (
        <div className="flex w-full max-w-[min(80vh,900px)] flex-wrap justify-center gap-3">
          {state.position.effects.map((effect) => (
            <span
              key={`${effect.kind}${effect.side}`}
              className="rounded-xl border border-accent bg-tint px-4 py-2 text-lg"
            >
              <span className="font-semibold text-accent">
                {EFFECT_LABEL[effect.kind]}
              </span>
              <span className="text-muted">
                {" "}
                — {EFFECT_HINT[effect.kind]}, {effectWhom(effect, null)},{" "}
                {effectLeft(effect)}
              </span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="w-full max-w-[min(80vh,900px)]">
        <Board
          position={state.position}
          controls={[]}
          lastMove={state.lastMove}
          // «Тремор» крутит доску и зрителям: они смотрят ту же партию.
          flipped={shaking(state.position)}
          covered={state.covered}
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
                : `Победа: ${(state.seats > 2 ? BATTLE_SIDE_NAME[state.result] : SIDE_NAME[state.result]) ?? "другие"}`}
            <span className="ml-3 text-xl text-muted">
              {state.reason ? REASON_TEXT[state.reason] : ""}
            </span>
          </div>
        ) : state.phase === "playing" || state.phase === "setup" ? (
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
  score,
  align = "left",
}: {
  nickname: string;
  side: string;
  /** Что показывает режим: счёт снятых фигур, заряд бомбы. */
  score?: string | null;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="text-3xl font-semibold">{nickname}</div>
      <div className="text-lg text-muted">
        {side}
        {score ? ` · ${score}` : ""}
      </div>
    </div>
  );
}

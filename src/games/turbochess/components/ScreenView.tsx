"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { REASON_TEXT } from "../engine/outcome";
import type { Side } from "../engine/pieces";
import { takenCount } from "../modes/annihilation";
import { BATTLE_SIDE_NAME } from "../modes/battle";
import {
  BINGE_RANKS,
  BINGE_RANK_LABEL,
  EFFECT_LABEL,
  effectLeft,
  effectWhom,
  shaking,
} from "../modes/binge";
import { modeInfo } from "../modes/catalog";
import { pointsLeft } from "../modes/market";
import { nuclearCharge, nuclearThreshold } from "../modes/nuclear";
import { rulesOf } from "../modes/rules";
import { zombieQueue } from "../modes/zombies";
import { MOVE_LIMIT_MS } from "../rooms/settings";
import type { TurboStatePayload } from "../protocol";
import { Board } from "./Board";
import { useTurboRoom } from "./useTurboRoom";

/**
 * Вид «экран»: партия для телевизора и трансляции.
 *
 * Вариант «Эфир», выбранный хозяином канвой из трёх (правило D0,
 * docs/PLAN.md, этап 15в): тёмный кадр, доска по центру, игроки крупными
 * карточками по бокам, режим и его эффекты в верхней строке, событие —
 * плашкой внизу кадра. Кадр рассчитан на 16:9 и тянется под любой размер
 * экрана: всё меряется долями высоты и ширины, а не пикселями.
 *
 * Управлять здесь нечем: экран не сидит за столом и ходов не делает. Зато
 * показывает всё, что у режима видно всем, — счёт, заряд, стопку, резерв, —
 * и болтовню ботов: она на трансляции и есть часть зрелища.
 */

const SIDE_NAME = ["белые", "чёрные"] as const;

/** Палитра кадра — «Карамель» игры, повёрнутая в тёмную сторону. */
const INK = "#1c0b04";
const CARD = "#2b1206";
const BUBBLE = "#3a1a0a";
const CREAM = "#f6dcc4";
const DIM = "#c8956a";
const FIRE = "#ff7a3d";

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
      <main
        className="flex h-svh items-center justify-center p-10 text-[3vh]"
        style={{ background: INK, color: DIM }}
      >
        Подключаемся к столу…
      </main>
    );
  }

  const four = state.seats > 2;
  // Вдвоём чёрные слева, белые справа: доска стоит белыми к зрителю, и игрок
  // сидит со своей стороны кадра. Вчетвером — по двое с каждой стороны.
  const left: Side[] = four ? [1, 2] : [1];
  const right: Side[] = four ? [3, 0] : [0];

  return (
    <main
      className="flex h-svh flex-col gap-[2vh] overflow-hidden px-[3vw] pb-[3vh] pt-[3.4vh]"
      style={{ background: INK, color: CREAM }}
    >
      <Header state={state} />

      <div className="flex min-h-0 flex-1 items-center justify-between gap-[2vw]">
        <div className="flex flex-col gap-[2vh]">
          {left.map((seat) => (
            <SeatCard
              key={seat}
              state={state}
              seat={seat}
              compact={four}
              clockOffset={room.clockOffset}
            />
          ))}
        </div>

        <div className="aspect-square w-[min(72svh,42vw)] shrink-0">
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

        <div className="flex flex-col gap-[2vh]">
          {right.map((seat) => (
            <SeatCard
              key={seat}
              state={state}
              seat={seat}
              compact={four}
              clockOffset={room.clockOffset}
            />
          ))}
        </div>
      </div>

      <LowerThird state={state} />
    </main>
  );
}

/** Верхняя строка: режим, действующие эффекты и остаток в колодах. */
function Header({ state }: { state: TurboStatePayload }) {
  const position = state.position;
  const variant = state.mode
    ? rulesOf(state.mode, state.options ?? {}).variant
    : null;

  return (
    <header className="flex h-[7vh] items-center justify-between gap-[2vw]">
      <div className="flex min-w-0 items-center gap-[1vw]">
        {/* eslint-disable-next-line @next/next/no-img-element -- знак коробки: без оптимизатора, как и на полке */}
        <img
          src="/games/turbochess/logo.png"
          alt="Турбо-шахматы"
          className="h-[5.6vh] w-auto"
        />
        {state.mode ? (
          <span className="truncate text-[3.6vh] font-extrabold">
            {modeInfo(state.mode).title}
            {variant ? (
              <span
                className="ml-[0.8vw] text-[2.2vh] font-medium"
                style={{ color: DIM }}
              >
                {variant}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-center gap-[0.6vw]">
        {position?.effects.map((effect) => (
          <span
            key={`${effect.kind}${effect.side}`}
            className="rounded-[0.7vw] border px-[0.8vw] py-[0.6vh] text-[1.8vh]"
            style={{ borderColor: FIRE }}
          >
            <b style={{ color: FIRE }}>{EFFECT_LABEL[effect.kind]}</b>
            {" · "}
            {effectWhom(effect, null)} · {effectLeft(effect)}
          </span>
        ))}
      </div>

      {state.bingeLeft ? (
        <div
          className="flex items-baseline gap-[0.8vw]"
          title={BINGE_RANKS.map((rank) => BINGE_RANK_LABEL[rank]).join(" · ")}
        >
          <span
            className="text-[1.5vh] uppercase tracking-[0.1em]"
            style={{ color: DIM }}
          >
            колоды
          </span>
          <span className="tabular font-mono text-[2.5vh] font-bold">
            {BINGE_RANKS.map((rank) => state.bingeLeft?.[rank] ?? 0).join(
              " · ",
            )}
          </span>
        </div>
      ) : (
        <span />
      )}
    </header>
  );
}

/** Карточка игрока: кто, какой стороной, его часы, счёт режима и реплика. */
function SeatCard({
  state,
  seat,
  compact,
  clockOffset,
}: {
  state: TurboStatePayload;
  seat: Side;
  compact: boolean;
  clockOffset: number;
}) {
  const player = state.players.find((one) => one.seat === seat) ?? null;
  const moving = state.phase === "playing" && state.turn === seat;
  const side = state.seats > 2 ? BATTLE_SIDE_NAME[seat] : SIDE_NAME[seat];
  const score = scoreOf(state, seat);
  const line = player ? state.said[player.id] : undefined;

  return (
    <section
      className={`flex w-[23vw] flex-col rounded-[1.2vw] ${compact ? "gap-[1vh] p-[1.1vw]" : "gap-[1.8vh] p-[1.5vw]"}`}
      style={{
        background: CARD,
        boxShadow: moving ? `inset 0 0 0 2px ${FIRE}` : undefined,
      }}
    >
      <div className="flex items-center gap-[0.9vw]">
        {player ? (
          <Avatar id={player.avatarId} size={compact ? 48 : 68} />
        ) : null}
        <div className="flex min-w-0 flex-col">
          <span
            className={`truncate font-extrabold ${compact ? "text-[2.4vh]" : "text-[3.2vh]"}`}
          >
            {player?.nickname ?? "ждём игрока"}
          </span>
          <span
            className="text-[1.8vh] font-medium"
            style={{ color: moving ? FIRE : DIM }}
          >
            {side}
            {moving ? " · думает" : ""}
            {score ? ` · ${score}` : ""}
          </span>
        </div>
      </div>

      <Clock
        state={state}
        moving={moving}
        compact={compact}
        clockOffset={clockOffset}
      />

      {line ? (
        <p
          className={`m-0 rounded-[0.3vw_1.1vw_1.1vw_1.1vw] px-[1vw] py-[1.2vh] leading-snug ${compact ? "text-[1.8vh]" : "text-[2.3vh]"}`}
          style={{ background: BUBBLE }}
        >
          {line}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Часы хода. Идут только у того, чей ход, и только когда ход и правда идёт:
 * пока висит карточка загула или стопка, часы стоят — и на экране тоже.
 * Остальным показан лимит на ход: это то, что их ждёт.
 */
function Clock({
  state,
  moving,
  compact,
  clockOffset,
}: {
  state: TurboStatePayload;
  moving: boolean;
  compact: boolean;
  clockOffset: number;
}) {
  const limit = state.timeControl ? MOVE_LIMIT_MS[state.timeControl] : null;
  const running =
    moving &&
    !state.binge &&
    !state.toast &&
    state.deadline !== null &&
    limit !== null;
  const left = useLeft(running ? state.deadline : null, clockOffset);

  if (state.phase !== "playing") return null;

  const size = compact ? "text-[4.4vh]" : "text-[6.4vh]";
  if (!running) {
    return (
      <span
        className={`tabular font-mono font-bold ${size}`}
        style={{ color: DIM }}
      >
        {limit === null ? "без лимита" : clock(limit)}
      </span>
    );
  }

  const share = Math.min(1, left / limit);
  const low = left <= 5000;

  return (
    <div className="flex flex-col gap-[1vh]">
      <span
        className={`tabular font-mono font-bold ${size}`}
        style={{ color: low ? "#ff4b2b" : FIRE }}
      >
        {clock(left)}
      </span>
      <div
        className="h-[1vh] overflow-hidden rounded-full"
        style={{ background: BUBBLE }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-200 ease-linear"
          style={{ width: `${share * 100}%`, background: FIRE }}
        />
      </div>
    </div>
  );
}

/** Сколько осталось до дедлайна; тикает, пока дедлайн есть. */
function useLeft(deadline: number | null, clockOffset: number): number {
  const [, tick] = useState(0);

  useEffect(() => {
    if (deadline === null) return;
    const timer = setInterval(() => tick((value) => value + 1), 200);
    return () => clearInterval(timer);
  }, [deadline]);

  return deadline === null ? 0 : remaining(deadline, clockOffset);
}

/** Остаток до дедлайна по часам сервера: смещение часов учтено. */
function remaining(deadline: number, clockOffset: number): number {
  return Math.max(0, deadline - (Date.now() + clockOffset));
}

function clock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Что у режима видно всем про это место: счёт, заряд, очки, резерв.
 *
 * Экран смотрят зрители, поэтому здесь открыто то, что за столом у каждого
 * своё: заряд бомбы, например. Соперник за доской чужого заряда по-прежнему
 * не видит. Тайное же — двойной агент — не показывается никому: экран
 * смотрит и сам соперник.
 */
function scoreOf(state: TurboStatePayload, seat: Side): string | null {
  const position = state.position;
  if (!position) return null;

  switch (state.mode) {
    case "ANNIHILATION":
      return `снял фигур: ${takenCount(position, seat)}`;
    case "BOOZE":
      return `выпито: ${state.drinks[seat] ?? 0}`;
    case "NUCLEAR":
      return `заряд ${nuclearCharge(position, seat)} из ${nuclearThreshold(state.options ?? {})}`;
    case "BLACK_MARKET":
      return `очков: ${pointsLeft(position, seat)}`;
    case "ANARCHY":
      return `«НЕТ» осталось: ${position.vetoes[seat] ?? 0}`;
    case "LAST_CHANCE":
      return (position.chances[seat] ?? 0) > 0
        ? "шанс в запасе"
        : "шанс истрачен";
    case "REINFORCEMENTS":
      return `в резерве: ${position.reserve[seat]?.length ?? 0}`;
    case "ZOMBIE": {
      const coming = zombieQueue(position, seat).length;
      const ready = position.reserve[seat]?.length ?? 0;
      return `зомби: готово ${ready}, в пути ${coming}`;
    }
    case "BINGE":
      return state.binge?.by === seat ? "тянет карту" : null;
    default:
      return null;
  }
}

/**
 * Плашка внизу кадра: событие, которое сейчас главное. Итог партии важнее
 * всего, потом карта загула, потом стопка, потом фаза стола. Нечего сказать —
 * плашки нет, и кадр отдаётся доске.
 */
function LowerThird({ state }: { state: TurboStatePayload }) {
  const name = (seat: Side) =>
    state.players.find((one) => one.seat === seat)?.nickname ??
    (state.seats > 2 ? BATTLE_SIDE_NAME[seat] : SIDE_NAME[seat]) ??
    "—";

  let tag: string;
  let title: string;
  let text: string | null = null;

  if (state.phase === "over") {
    tag = "итог";
    title =
      state.result === "draw"
        ? "Ничья"
        : state.result === null
          ? "Партия кончилась"
          : `Победа: ${name(state.result)}`;
    text = state.reason ? REASON_TEXT[state.reason] : null;
  } else if (state.binge) {
    tag = "карта";
    title = state.binge.event.title;
    text = state.binge.miss
      ? "Мимо: в этой позиции событию нечего делать."
      : state.binge.event.text;
  } else if (state.toast) {
    tag = "стопка";
    title = `${name(state.toast.drinker)} пьёт`;
    text = `Подтверждает ${name(state.toast.pourer)}.`;
  } else if (state.phase === "setup") {
    tag = "расстановка";
    title = "Расставляются вслепую";
    text = "Вскроемся разом.";
  } else if (state.phase === "waiting") {
    tag = "стол";
    title = "Ждём игроков";
  } else {
    return null;
  }

  return (
    <footer
      className="flex items-center gap-[1.4vw] rounded-[0.9vw] px-[1.6vw] py-[1.6vh]"
      style={{ background: CREAM, color: CARD }}
    >
      <span
        className="rounded-[0.5vw] px-[0.7vw] py-[0.6vh] text-[1.7vh] font-bold uppercase tracking-[0.1em]"
        style={{ background: "#c2410c", color: "#fff3ea" }}
      >
        {tag}
      </span>
      <span className="text-[3vh] font-extrabold">{title}</span>
      {text ? (
        <span
          className="min-w-0 flex-1 truncate text-[2.3vh]"
          style={{ color: "#5a2a12" }}
        >
          {text}
        </span>
      ) : null}
      {state.binge ? (
        <span className="text-[1.9vh]" style={{ color: "#8a4a2c" }}>
          вытянул {name(state.binge.by)}
        </span>
      ) : null}
    </footer>
  );
}

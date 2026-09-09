"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { InviteModal } from "@/components/rooms/InviteModal";
import { Countdown } from "@/components/ui/Countdown";
import { useExitWarning } from "@/components/games/ExitToShelf";
import { REASON_TEXT } from "../engine/outcome";
import type { ChessColor, ChessPlayerPayload } from "../protocol";
import { Board } from "./Board";
import { useChessRoom } from "./useChessRoom";

/**
 * Комната шахмат: доска, часы, ходы и две кнопки.
 *
 * Всё состояние приходит снимком с сервера — здесь только показ и ввод. Доска
 * своё расхождение с сервером всегда решает в его пользу.
 */

export function GameRoom({
  roomCode,
  userId,
}: {
  roomCode?: string;
  userId: string;
}) {
  const room = useChessRoom(roomCode);
  const [flipped, setFlipped] = useState<boolean | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Ссылка берётся из адресной строки: снаружи и изнутри сети адрес разный, и
  // правильный тот, по которому человек сюда пришёл.
  const link =
    typeof window === "undefined" || !roomCode
      ? ""
      : `${window.location.origin}/r/${roomCode}`;

  const state = room.state;
  const me = state?.players.find((player) => player.id === userId) ?? null;
  const opponent =
    state?.players.find((player) => player.id !== userId) ?? null;
  const myColor = me?.color ?? null;

  // Уход посреди партии стоит поражения — платформа спросит об этом на выходе.
  useExitWarning(
    state?.phase === "playing" && myColor
      ? "Партия идёт: уход засчитают за поражение."
      : null,
  );

  if (room.kicked) {
    return <Notice title="Комната закрыта" text={room.kicked} />;
  }
  if (!state) {
    return (
      <Notice
        title="Подключаемся"
        text={room.error ?? "Ищем стол и раскладываем фигуры."}
      />
    );
  }

  // В общем зале до посадки доски нет вовсе: человек стоит в очереди.
  if (state.phase === "queue") {
    return (
      <Queue
        queued={state.queued === true}
        lobby={state.lobby}
        onEnter={room.rematch}
        onLeave={room.leaveQueue}
        error={room.error}
      />
    );
  }

  // Зритель смотрит с белой стороны, игрок — со своей.
  const orientation = flipped ?? myColor === "black";
  const over = state.phase === "over";
  const waiting = state.phase === "waiting";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6 lg:flex-row lg:items-start">
      <div className="mx-auto w-full max-w-[min(78vh,560px)]">
        <Board
          fen={state.fen ?? START}
          myColor={over ? null : myColor}
          turn={state.turn}
          lastMove={state.lastMove}
          ply={state.moves.length}
          flipped={orientation}
          streamer={state.streamerMode}
          onMove={room.move}
        />
      </div>

      <aside className="flex w-full flex-col gap-3 lg:w-72">
        <Seat
          player={opponent}
          color={myColor === "white" ? "black" : "white"}
          active={!over && !waiting && state.turn !== myColor}
          state={state}
          clockOffset={room.clockOffset}
          placeholder="Ждём соперника"
        />

        <Moves moves={state.moves} />

        <Seat
          player={me}
          color={myColor ?? "white"}
          active={!over && !waiting && state.turn === myColor}
          state={state}
          clockOffset={room.clockOffset}
          placeholder="Ты смотришь"
        />

        {waiting && roomCode ? (
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-paper transition hover:bg-deep"
          >
            Позвать соперника
          </button>
        ) : null}

        {over ? (
          <Result state={state} myColor={myColor} onRematch={room.rematch} />
        ) : myColor ? (
          <Controls
            claimable={state.claimable !== null}
            onClaim={room.claimDraw}
            onResign={room.resign}
          />
        ) : null}

        <button
          type="button"
          onClick={() => setFlipped(!orientation)}
          className="rounded-lg border border-line bg-paper px-3 py-2 text-xs font-semibold text-muted transition hover:border-accent hover:text-accent"
        >
          Развернуть доску
        </button>

        {room.error ? (
          <p className="rounded-lg bg-tint px-3 py-2 text-xs text-accent">
            {room.error}
          </p>
        ) : null}
        {!room.connected ? (
          <p className="text-xs text-muted">Связь потеряна, восстанавливаем…</p>
        ) : null}
      </aside>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        link={link}
        hint="Наведи камеру телефона — и сядешь за эту же доску."
      />
    </main>
  );
}

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Общий зал до посадки: очередь и сводка.
 *
 * Бота молча не подсовываем: не нашлось соперника — так и говорим, а что
 * делать дальше, человек решает сам (src/games/chess/docs/BACKLOG.md A1).
 */
function Queue({
  queued,
  lobby,
  onEnter,
  onLeave,
  error,
}: {
  queued: boolean;
  lobby?: { waiting: number; boards: number; present: number };
  onEnter: () => void;
  onLeave: () => void;
  error: string | null;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Общий зал</h1>
        <p className="text-balance text-sm text-muted">
          {queued
            ? "Ищем соперника. Полминуты на ход, партия идёт в рейтинг."
            : "Тут играют с незнакомцами: полминуты на ход, без приглашений."}
        </p>
      </div>

      {lobby ? (
        <dl className="flex gap-6 text-sm">
          <Stat label="ждут" value={lobby.waiting} />
          <Stat label="партий" value={lobby.boards} />
          <Stat label="в зале" value={lobby.present} />
        </dl>
      ) : null}

      {queued ? (
        <div className="flex flex-col items-center gap-3">
          <span className="text-sm text-muted">
            Пока никого. Можно подождать здесь, позвать друга по ссылке или
            сыграть с ботом, когда он появится.
          </span>
          <button
            type="button"
            onClick={onLeave}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent"
          >
            Не ждать
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onEnter}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-deep"
        >
          Играть
        </button>
      )}

      {error ? <p className="text-xs text-accent">{error}</p> : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <dd className="tabular text-xl font-semibold">{value}</dd>
      <dt className="text-xs text-muted">{label}</dt>
    </div>
  );
}

function Seat({
  player,
  color,
  active,
  state,
  clockOffset,
  placeholder,
}: {
  player: ChessPlayerPayload | null;
  color: ChessColor;
  /** Его ход: часы тикают только у одного. */
  active: boolean;
  state: { deadline: number | null; phaseDurationMs: number | null };
  clockOffset: number;
  placeholder: string;
}) {
  if (!player) {
    return (
      <div className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">
        {placeholder}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-3">
      <div className="flex items-center gap-3">
        <Avatar id={player.avatarId} size={36} />
        <div className="flex-1">
          <div className="text-sm font-semibold">{player.nickname}</div>
          <div className="text-xs text-muted">
            {color === "white" ? "белые" : "чёрные"} · {player.rating}
            {player.away ? " · вышел" : ""}
          </div>
        </div>
      </div>

      {active ? (
        <Countdown
          deadline={state.deadline}
          durationMs={state.phaseDurationMs}
          clockOffset={clockOffset}
        />
      ) : null}
    </div>
  );
}

/** Список ходов парами: белые слева, чёрные справа. */
function Moves({ moves }: { moves: string[] }) {
  const pairs: [string, string | undefined][] = [];
  for (let at = 0; at < moves.length; at += 2) {
    pairs.push([moves[at] as string, moves[at + 1]]);
  }

  return (
    <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-xl border border-line bg-paper p-3 text-sm lg:flex-1">
      {pairs.length === 0 ? (
        <span className="text-xs text-muted">Ходов пока нет</span>
      ) : (
        pairs.map(([white, black], index) => (
          <div key={index} className="tabular flex gap-2">
            <span className="w-6 text-right text-xs text-muted">
              {index + 1}.
            </span>
            <span className="w-16">{white}</span>
            <span className="w-16">{black ?? ""}</span>
          </div>
        ))
      )}
    </div>
  );
}

function Controls({
  claimable,
  onClaim,
  onResign,
}: {
  claimable: boolean;
  onClaim: () => void;
  onResign: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      {claimable ? (
        <button
          type="button"
          onClick={onClaim}
          className="rounded-lg border border-accent bg-tint px-3 py-2 text-sm font-semibold text-accent transition hover:bg-accent-soft/20"
        >
          Требовать ничью
        </button>
      ) : null}

      {/*
        Сдача с подтверждением, и стоит она отдельно от прочих кнопок: цена
        промаха — партия (src/games/chess/docs/BACKLOG.md G).
      */}
      {confirming ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onResign}
            className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-paper transition hover:bg-deep"
          >
            Сдаюсь
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted transition hover:text-ink"
          >
            Играю
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent"
        >
          Сдаться
        </button>
      )}
    </div>
  );
}

function Result({
  state,
  myColor,
  onRematch,
}: {
  state: { result: string | null; reason: string | null };
  myColor: ChessColor | null;
  onRematch: () => void;
}) {
  const { result, reason } = state;
  const title =
    result === "draw"
      ? "Ничья"
      : result === myColor
        ? "Победа"
        : myColor
          ? "Поражение"
          : result === "white"
            ? "Победили белые"
            : "Победили чёрные";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-accent bg-tint px-4 py-3">
      <div>
        <div className="text-sm font-semibold text-accent">{title}</div>
        <div className="text-xs text-muted">
          {reason ? REASON_TEXT[reason as keyof typeof REASON_TEXT] : ""}
        </div>
      </div>

      {myColor ? (
        <button
          type="button"
          onClick={onRematch}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-paper transition hover:bg-deep"
        >
          Ещё партия, цветами меняемся
        </button>
      ) : null}
    </div>
  );
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-sm text-balance text-sm text-muted">{text}</p>
    </main>
  );
}

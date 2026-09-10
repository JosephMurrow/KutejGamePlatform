"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { InviteModal } from "@/components/rooms/InviteModal";
import { Countdown } from "@/components/ui/Countdown";
import { useExitWarning } from "@/components/games/ExitToShelf";
import { REASON_TEXT } from "../engine/outcome";
import { VIEWER_DELAY_LABEL } from "../rooms/settings";
import type { ChessColor, ChessPlayerPayload } from "../protocol";
import { Board } from "./Board";
import { frames, START, taken } from "./replay";
import { useSound } from "./sound";
import { LeaderboardModal } from "./leaderboard/Modal";
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
  const [ratingOpen, setRatingOpen] = useState(false);
  /** Какой полуход смотрим; `null` — партию как она есть. */
  const [at, setAt] = useState<number | null>(null);
  const sound = useSound();

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

  // Пустой список нужен своей ссылкой: иначе он каждый раз новый, и от него
  // пересчитывается всё, что на нём висит.
  const moves = useMemo(() => state?.moves ?? NO_MOVES, [state?.moves]);
  const list = useMemo(() => frames(moves), [moves]);
  /** Позиция, которую смотрим: своя при перемотке, серверная — обычно. */
  const rewound = at !== null && at < list.length - 1 ? list[at] : null;

  // Звук по свежему ходу: щелчок, взятие, шах или конец партии.
  const heard = useRef(0);
  useEffect(() => {
    const now = moves.length;
    const was = heard.current;
    heard.current = now;

    if (now <= was || was === 0) return;

    const last = moves.at(-1) ?? "";
    if (state?.phase === "over") sound.play("end");
    else if (last.includes("#") || last.includes("+")) sound.play("check");
    else if (last.includes("x")) sound.play("capture");
    else sound.play("move");
  }, [moves, sound, state?.phase]);

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
      {/*
        Доска — квадрат от меньшей стороны. Высота считается в svh, а не в vh:
        на телефоне адресная строка то есть, то нет, и по vh доска регулярно
        не помещается (src/games/chess/docs/BACKLOG.md G).
      */}
      <div className="mx-auto flex w-full max-w-[min(78svh,560px)] flex-col gap-1">
        <Taken
          side={orientation ? "white" : "black"}
          fen={rewound?.fen ?? state.fen ?? START}
        />

        <Board
          // В перемотке доска показывает прошлое и ходить из него нельзя.
          fen={rewound?.fen ?? state.fen ?? START}
          myColor={over || rewound ? null : myColor}
          turn={state.turn}
          lastMove={rewound ? rewound.lastMove : state.lastMove}
          ply={state.moves.length}
          flipped={orientation}
          streamer={state.streamerMode}
          premoves={!over && !waiting && !rewound && myColor !== null}
          onHold={state.magnus ? room.hold : undefined}
          onMove={room.move}
        />

        <Taken
          side={orientation ? "black" : "white"}
          fen={rewound?.fen ?? state.fen ?? START}
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

        <Moves moves={state.moves} at={at ?? state.moves.length} onGo={setAt} />

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
            offer={state.drawOffer}
            myColor={myColor}
            onClaim={room.claimDraw}
            onOffer={room.offerDraw}
            onDecline={room.declineDraw}
            onResign={room.resign}
          />
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFlipped(!orientation)}
            className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-xs font-semibold text-muted transition hover:border-accent hover:text-accent"
          >
            Развернуть доску
          </button>
          {/* Окном, а не ссылкой: переход оборвал бы сокет и высадил из-за доски. */}
          <button
            type="button"
            onClick={() => setRatingOpen(true)}
            className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-xs font-semibold text-muted transition hover:border-accent hover:text-accent"
          >
            Рейтинг
          </button>
          <button
            type="button"
            onClick={sound.toggle}
            aria-pressed={sound.on}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-xs font-semibold text-muted transition hover:border-accent hover:text-accent"
          >
            {sound.on ? "Звук" : "Тихо"}
          </button>
        </div>

        <Notes
          streamer={state.streamerMode}
          delay={state.viewerDelay}
          magnus={state.magnus && myColor !== null}
          watching={myColor === null}
        />

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

      <LeaderboardModal
        open={ratingOpen}
        onClose={() => setRatingOpen(false)}
      />
    </main>
  );
}

/**
 * Что в этой комнате устроено не как обычно.
 *
 * Режим стримера и задержку видно всем: первый меняет то, как ведёт себя доска,
 * вторая — то, насколько зритель отстал. Молчание тут выглядело бы поломкой —
 * зритель решил бы, что комната зависла (src/games/chess/docs/BACKLOG.md F2).
 */
function Notes({
  streamer,
  delay,
  magnus,
  watching,
}: {
  streamer: boolean;
  delay: keyof typeof VIEWER_DELAY_LABEL;
  /** Соперник видит, за что ты берёшься. Умалчивать об этом было бы нечестно. */
  magnus: boolean;
  watching: boolean;
}) {
  const lines: string[] = [];

  if (magnus) {
    lines.push("Соперник видит, за какую фигуру ты берёшься. Он предупреждён.");
  }
  if (streamer) lines.push("Режим стримера: подсказки и подсветка выключены.");
  if (delay !== "NONE") {
    lines.push(
      watching
        ? `Ты смотришь с задержкой: ${VIEWER_DELAY_LABEL[delay]} позади игроков.`
        : `Зрители видят партию на ${VIEWER_DELAY_LABEL[delay]} позже тебя.`,
    );
  }

  if (lines.length === 0) return null;

  return (
    <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted">
      {lines.join(" ")}
    </p>
  );
}

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
            {player.provisional ? "?" : ""}
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
/**
 * Список ходов с перемоткой.
 *
 * Перемотка **ничего не отправляет на сервер**: это способ посмотреть, а не
 * действие. Партия идёт своим чередом, и пока человек в прошлом, ходить он не
 * может — доска про это скажет сама (src/games/chess/docs/BACKLOG.md G).
 */
function Moves({
  moves,
  at,
  onGo,
}: {
  moves: string[];
  /** Какой полуход показан: `moves.length` — последний, он же живой. */
  at: number;
  onGo: (at: number | null) => void;
}) {
  const pairs: [string, string | undefined][] = [];
  for (let index = 0; index < moves.length; index += 2) {
    pairs.push([moves[index] as string, moves[index + 1]]);
  }

  const live = at >= moves.length;
  const go = (next: number) => onGo(next >= moves.length ? null : next);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-3 text-sm lg:flex-1">
      <div className="flex max-h-44 flex-col gap-1 overflow-y-auto lg:max-h-none lg:flex-1">
        {pairs.length === 0 ? (
          <span className="text-xs text-muted">Ходов пока нет</span>
        ) : (
          pairs.map(([white, black], index) => (
            <div key={index} className="tabular flex items-center gap-2">
              <span className="w-6 text-right text-xs text-muted">
                {index + 1}.
              </span>
              <Ply san={white} to={index * 2 + 1} at={at} onGo={go} />
              {black ? (
                <Ply san={black} to={index * 2 + 2} at={at} onGo={go} />
              ) : (
                <span className="w-16" />
              )}
            </div>
          ))
        )}
      </div>

      {moves.length > 0 ? (
        <div className="flex items-center gap-1 border-t border-line pt-2">
          <Step label="⏮" title="К началу" onGo={() => go(0)} off={at === 0} />
          <Step
            label="◀"
            title="Ход назад"
            onGo={() => go(Math.max(0, at - 1))}
            off={at === 0}
          />
          <Step
            label="▶"
            title="Ход вперёд"
            onGo={() => go(at + 1)}
            off={live}
          />
          <Step label="⏭" title="К партии" onGo={() => onGo(null)} off={live} />
          {!live ? (
            <span className="ml-auto text-xs text-muted">смотришь прошлое</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Ply({
  san,
  to,
  at,
  onGo,
}: {
  san: string;
  to: number;
  at: number;
  onGo: (at: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onGo(to)}
      className={`w-16 rounded px-1 text-left transition hover:text-accent ${
        at === to ? "bg-tint font-semibold text-accent" : ""
      }`}
    >
      {san}
    </button>
  );
}

function Step({
  label,
  title,
  onGo,
  off,
}: {
  label: string;
  title: string;
  onGo: () => void;
  off: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onGo}
      disabled={off}
      title={title}
      aria-label={title}
      className="rounded px-2 py-1 text-xs text-muted transition hover:text-accent disabled:opacity-30"
    >
      {label}
    </button>
  );
}

/**
 * Взятые фигуры и материальный перевес — то, что считают в уме и сбиваются.
 *
 * `side` — кто сидит с этой стороны доски. Показываем **его** трофеи: снятые с
 * доски фигуры соперника и его же перевес, если тот есть.
 */
function Taken({ side, fen }: { side: ChessColor; fen: string }) {
  const lost = taken(fen);
  const pieces = side === "white" ? lost.black : lost.white;
  const edge = side === "white" ? lost.edge : -lost.edge;

  if (pieces.length === 0 && edge <= 0) return <div className="h-5" />;

  return (
    <div className="flex h-5 items-center gap-1 text-xs text-muted">
      <span className="tracking-tight">
        {pieces.map((type) => GLYPH[type]).join("")}
      </span>
      {edge > 0 ? <span className="tabular">+{edge}</span> : null}
    </div>
  );
}

/** Ходов ещё нет. Ссылка одна на всех: от неё зависят пересчёты. */
const NO_MOVES: string[] = [];

/** Фигуры значками: ряд взятых читается одним взглядом. */
const GLYPH: Record<string, string> = {
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

function Controls({
  claimable,
  offer,
  myColor,
  onClaim,
  onOffer,
  onDecline,
  onResign,
}: {
  claimable: boolean;
  /** Кто предложил ничью и ждёт ответа. */
  offer: ChessColor | null;
  myColor: ChessColor;
  onClaim: () => void;
  onOffer: () => void;
  onDecline: () => void;
  onResign: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const theirs = offer !== null && offer !== myColor;

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

      {theirs ? (
        <div className="flex flex-col gap-2 rounded-lg border border-accent bg-tint px-3 py-2">
          <span className="text-xs text-accent">Соперник предлагает ничью</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onOffer}
              className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-paper transition hover:bg-deep"
            >
              Согласиться
            </button>
            <button
              type="button"
              onClick={onDecline}
              className="flex-1 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-muted transition hover:text-ink"
            >
              Играем
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOffer}
          disabled={offer === myColor}
          className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {offer === myColor ? "Ничья предложена" : "Предложить ничью"}
        </button>
      )}

      {/*
        Сдача с подтверждением, и стоит она отдельно от прочих кнопок: цена
        промаха — партия (src/games/chess/docs/BACKLOG.md G).
      */}
      {/*
        Сдача стоит отдельно от «ничьей» и с отступом: рядом эти две кнопки —
        прямой путь к промаху пальцем (src/games/chess/docs/BACKLOG.md G).
      */}
      {confirming ? (
        <div className="mt-3 flex gap-2">
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
          className="mt-3 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent"
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

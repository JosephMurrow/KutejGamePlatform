"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { UserMenu } from "@/components/UserMenu";
import { Chat } from "@/components/room/Chat";
import { InviteModal } from "@/components/rooms/InviteModal";
import { Countdown } from "@/components/ui/Countdown";
import { useExitWarning } from "@/components/games/ExitToShelf";
import type { MoveInput } from "../engine/game";
import { REASON_TEXT } from "../engine/outcome";
import type { Side } from "../engine/pieces";
import type { Position } from "../engine/position";
import { STALL_WARN, stallLeft, takenCount } from "../modes/annihilation";
import { modeInfo } from "../modes/catalog";
import { chanceReady } from "../modes/lastChance";
import { VETOES } from "../modes/anarchy";
import { nuclearCharge, nuclearThreshold } from "../modes/nuclear";
import { rulesOf } from "../modes/rules";
import type { ModeOptions } from "../rooms/settings";
import { MENU_LINKS } from "../menu";
import type { TurboPlayerPayload, TurboStatePayload } from "../protocol";
import { Board } from "./Board";
import { FlipIcon, IconButton, SoundIcon } from "./icons";
import { useSound } from "./sound";
import { useTurboRoom } from "./useTurboRoom";

/**
 * Комната турбо-шахмат: доска, места с часами, ходы и кнопки.
 *
 * Всё состояние приходит снимком с сервера — здесь только показ и ввод. Доска
 * своё расхождение с сервером всегда решает в его пользу. Устроено по образцу
 * шахматной комнаты, копией: игра не импортирует игру.
 */

const SIDE_NAME = ["белые", "чёрные"] as const;

function sideName(side: Side): string {
  return SIDE_NAME[side] ?? `сторона ${side + 1}`;
}

export function GameRoom({
  roomCode,
  userId,
  nickname,
  avatarId,
}: {
  roomCode: string;
  userId: string;
  nickname: string;
  avatarId: number;
}) {
  const room = useTurboRoom(roomCode);
  const [flipped, setFlipped] = useState<boolean | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const sound = useSound();

  // Ссылка — из адресной строки: снаружи и изнутри сети адрес разный, и
  // правильный тот, по которому человек сюда пришёл.
  const link =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/r/${roomCode}`;

  const state = room.state;
  const me = state?.players.find((player) => player.id === userId) ?? null;
  const mySide = me?.seat ?? null;
  const playing = state?.phase === "playing";
  /** «Вскрываемся»: до вскрытия ходов нет, фигуры меняются местами. */
  const arranging = state?.phase === "setup" && mySide !== null;

  // Звук по свежему ходу: щелчок, взятие, шах или конец партии.
  const heard = useRef(0);
  const moves = state?.moves;
  useEffect(() => {
    const now = moves?.length ?? 0;
    const was = heard.current;
    heard.current = now;
    if (!moves || now <= was || was === 0) return;

    const last = moves.at(-1) ?? "";
    if (state?.phase === "over") sound.play("end");
    else if (last.includes("#") || last.includes("+")) sound.play("check");
    else if (last.includes("x")) sound.play("capture");
    else sound.play("move");
  }, [moves, sound, state?.phase]);

  // Уход посреди партии стоит поражения — платформа спросит об этом на выходе.
  useExitWarning(
    (playing || state?.phase === "setup") && mySide !== null
      ? "Партия идёт: уход засчитают за поражение."
      : null,
  );

  // Зритель смотрит с белой стороны, игрок — со своей.
  const orientation = flipped ?? mySide === 1;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-4">
      {/*
        Шапка. Выход на витрину рисует платформа — он висит в углу над этой
        строкой; здесь то, что нужно игроку: звук, разворот и меню.
      */}
      <header className="flex items-center justify-between gap-3 pl-12">
        <div className="flex items-center gap-2">
          <IconButton
            label={sound.on ? "Выключить звук" : "Включить звук"}
            pressed={sound.on}
            onClick={sound.toggle}
          >
            <SoundIcon on={sound.on} />
          </IconButton>
          <IconButton
            label="Развернуть доску"
            onClick={() => setFlipped(!orientation)}
          >
            <FlipIcon />
          </IconButton>
        </div>

        <UserMenu nickname={nickname} avatarId={avatarId} links={MENU_LINKS} />
      </header>

      {room.kicked ? (
        <Notice title="Комната закрыта" text={room.kicked} />
      ) : !state || !state.position ? (
        <Notice
          title="Подключаемся"
          text={room.error ?? "Ищем стол и расставляем фигуры."}
        />
      ) : (
        <main className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-start">
          {/*
            Доска — квадрат от меньшей стороны. Высота в svh, а не в vh: на
            телефоне адресная строка то есть, то нет, и по vh доска не
            помещается.
          */}
          <div className="mx-auto w-full max-w-[min(78svh,560px)]">
            <Board
              position={state.position}
              controls={playing && mySide !== null ? [mySide] : []}
              lastMove={state.lastMove}
              flipped={orientation}
              covered={state.covered}
              onSwap={
                arranging ? (from, to) => void room.swap(from, to) : undefined
              }
              onMove={(input: MoveInput) =>
                room.move({ ...input, ply: state.moves.length })
              }
            />
          </div>

          <aside className="flex w-full flex-col gap-3 lg:w-72">
            <ModeCard state={state} />
            <ModeStatus
              state={state}
              mySide={mySide}
              onBomb={room.bomb}
              onChance={room.chance}
              onVeto={room.veto}
            />
            {state.phase === "setup" ? (
              <Setup
                state={state}
                mySide={mySide}
                clockOffset={room.clockOffset}
                onReady={room.ready}
              />
            ) : null}

            <Seat
              state={state}
              side={orientation ? 0 : 1}
              clockOffset={room.clockOffset}
              you={userId}
            />
            <Moves moves={state.moves} vetoed={state.vetoed} />
            <Seat
              state={state}
              side={orientation ? 1 : 0}
              clockOffset={room.clockOffset}
              you={userId}
            />

            {state.phase === "waiting" ||
            (state.phase === "over" && state.players.length < state.seats) ? (
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-surface transition hover:bg-deep"
              >
                Позвать соперника
              </button>
            ) : null}

            {state.phase === "over" ? (
              <Result state={state} mySide={mySide} onRematch={room.rematch} />
            ) : playing && mySide !== null ? (
              <Controls
                claimable={state.claimable !== null}
                offer={state.drawOffer}
                mySide={mySide}
                onClaim={room.claimDraw}
                onOffer={room.offerDraw}
                onDecline={room.declineDraw}
                onResign={room.resign}
              />
            ) : null}

            {mySide === null ? (
              <p className="text-xs text-muted">
                Ты смотришь: за столом места заняты.
              </p>
            ) : null}
            {room.error ? (
              <p className="rounded-lg bg-tint px-3 py-2 text-xs text-accent">
                {room.error}
              </p>
            ) : null}
            {!room.connected ? (
              <p className="text-xs text-muted">
                Связь потеряна, восстанавливаем…
              </p>
            ) : null}

            <div className="h-72 lg:h-80">
              <Chat
                messages={room.chat}
                youId={userId}
                onSend={room.sendChat}
              />
            </div>
          </aside>
        </main>
      )}

      {state?.toast ? (
        <Toast
          state={state}
          mySide={mySide}
          clockOffset={room.clockOffset}
          onConfirm={room.toast}
        />
      ) : null}

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        link={link}
        hint="Наведи камеру телефона — и сядешь за эту же доску."
      />
    </div>
  );
}

/**
 * Режим и его правила.
 *
 * До первого хода правила развёрнуты: игрок садится за шахматы, а получает не
 * шахматы, и узнать об этом должен до того, как потерял ферзя. Дальше —
 * по кнопке, чтобы не занимать место у доски (docs/MODES.md, «Подсказки»).
 */
function ModeCard({ state }: { state: TurboStatePayload }) {
  const [open, setOpen] = useState(false);
  if (!state.mode) return null;

  const info = modeInfo(state.mode);
  const rules = rulesOf(state.mode, state.options ?? {});
  const fresh = state.phase === "waiting" || state.moves.length === 0;
  const shown = fresh || open;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-paper px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{info.title}</span>
          {rules.variant ? (
            <span className="text-xs text-muted">{rules.variant}</span>
          ) : null}
        </div>
        {fresh ? null : (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="shrink-0 text-xs font-semibold text-accent transition hover:text-deep"
          >
            {open ? "Скрыть" : "Правила"}
          </button>
        )}
      </div>

      {shown ? (
        <div className="flex flex-col gap-1.5">
          {rules.lines.map((line) => (
            <p key={line} className="text-xs leading-relaxed text-muted">
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Окно алко-шахмат: одному пить, другому подтверждать. Часы на это время
 * стоят, а молчание считается отказом — и штраф прилетает обоим.
 */
function Toast({
  state,
  mySide,
  clockOffset,
  onConfirm,
}: {
  state: TurboStatePayload;
  mySide: Side | null;
  clockOffset: number;
  onConfirm: () => void;
}) {
  const toast = state.toast;
  if (!toast) return null;

  const drinking = mySide === toast.drinker;
  const pouring = mySide === toast.pourer;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/60 px-4">
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-accent bg-paper px-5 py-5 text-center">
        <span className="text-lg font-semibold">
          {drinking
            ? "Тебе необходимо выпить стопку"
            : pouring
              ? "Подтвердите, что игрок выпил"
              : "Игрок пьёт стопку"}
        </span>

        <Countdown
          deadline={state.deadline}
          durationMs={state.phaseDurationMs}
          clockOffset={clockOffset}
        />

        {pouring ? (
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-surface transition hover:bg-deep"
          >
            Выпил, подтверждаю
          </button>
        ) : null}

        <p className="text-xs text-muted">
          Не подтвердил за полминуты — штраф обоим: с доски снимется по
          случайной фигуре.
        </p>
      </div>
    </div>
  );
}

/**
 * Расстановка «Вскрываемся»: часы, счёт готовых и кнопка «готов». Сами фигуры
 * меняются местами на доске — здесь только то, что к ней не приклеить.
 */
function Setup({
  state,
  mySide,
  clockOffset,
  onReady,
}: {
  state: TurboStatePayload;
  mySide: Side | null;
  clockOffset: number;
  onReady: () => void;
}) {
  const mine = mySide !== null && (state.setupReady[mySide] ?? false);
  const ready = state.setupReady.filter(Boolean).length;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-accent bg-tint px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-accent">
          Расставляйтесь
        </span>
        <span className="tabular text-xs text-muted">
          готовы {ready} из {state.seats}
        </span>
      </div>

      <Countdown
        deadline={state.deadline}
        durationMs={state.phaseDurationMs}
        clockOffset={clockOffset}
      />

      {mySide === null ? (
        <p className="text-xs text-muted">
          Ты смотришь: до вскрытия закрыты обе половины.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted">
            Меняй свои фигуры местами прямо на доске. Король — только на первой
            горизонтали. Чужая половина закрыта, вскроемся разом.
          </p>
          <button
            type="button"
            onClick={onReady}
            disabled={mine}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-surface transition hover:bg-deep disabled:opacity-50"
          >
            {mine ? "Ждём соперника" : "Готов"}
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Что режим показывает по ходу партии: остаток до остановки у «на
 * уничтожение» и своя шкала заряда с кнопкой бомбы у «ядерных». Счёт взятых
 * фигур стоит у мест, рядом с теми, кто их съел.
 */
function ModeStatus({
  state,
  mySide,
  onBomb,
  onChance,
  onVeto,
}: {
  state: TurboStatePayload;
  mySide: Side | null;
  onBomb: () => void;
  onChance: () => void;
  onVeto: () => void;
}) {
  if (!state.position || state.phase !== "playing") return null;

  // «Последний шанс»: кнопка появляется под шахом, в том числе под матом.
  if (state.mode === "LAST_CHANCE" && mySide !== null) {
    if (!chanceReady(state.position, mySide)) return null;

    return (
      <button
        type="button"
        onClick={onChance}
        className="rounded-xl bg-[#c8281e] px-3 py-3 text-sm font-extrabold uppercase tracking-wide text-surface transition hover:bg-[#a71f16]"
      >
        Попробывать не умереть
      </button>
    );
  }

  // «Анархия»: отменить можно только новый чужой ход.
  if (state.mode === "ANARCHY" && mySide !== null) {
    const left = state.position.vetoes[mySide] ?? 0;
    const can =
      state.turn === mySide &&
      left > 0 &&
      state.moves.length > 0 &&
      state.position.banned === null;

    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onVeto}
          disabled={!can}
          className="rounded-xl bg-[#c8281e] px-3 py-3 text-lg font-extrabold text-surface transition hover:bg-[#a71f16] disabled:opacity-40"
        >
          НЕТ
        </button>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: VETOES }, (_, at) => (
            <span
              key={at}
              className={`size-2.5 rounded-full ${at < left ? "bg-accent" : "bg-line"}`}
            />
          ))}
          <span className="ml-1 text-xs text-muted">
            осталось «НЕТ»: {left}
          </span>
        </div>
      </div>
    );
  }

  if (state.mode === "ANNIHILATION") {
    const left = stallLeft(state.position);
    if (left > STALL_WARN) return null;

    return (
      <p className="rounded-lg bg-tint px-3 py-2 text-xs text-accent">
        Полуходов без взятий осталось: {left}. Потом партию остановят и
        посчитают по взятым фигурам.
      </p>
    );
  }

  if (state.mode === "NUCLEAR" && mySide !== null) {
    return (
      <Charge
        position={state.position}
        options={state.options ?? {}}
        side={mySide}
        myTurn={state.turn === mySide}
        onBomb={onBomb}
      />
    );
  }

  return null;
}

/**
 * Шкала заряда «Ядерных» — своя у каждого: соперник не должен понимать, в
 * каком состоянии бомба. Так решил хозяин (docs/MODES.md, режим 8).
 */
function Charge({
  position,
  options,
  side,
  myTurn,
  onBomb,
}: {
  position: Position;
  options: ModeOptions;
  side: Side;
  myTurn: boolean;
  onBomb: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const charge = nuclearCharge(position, side);
  const threshold = nuclearThreshold(options);
  const ready = charge >= threshold;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-paper px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">Заряд</span>
        <span className="tabular text-xs text-muted">
          {charge} из {threshold}
        </span>
      </div>

      <div
        className="h-2 overflow-hidden rounded-full bg-tint"
        role="progressbar"
        aria-valuenow={Math.min(charge, threshold)}
        aria-valuemin={0}
        aria-valuemax={threshold}
        aria-label="Заряд бомбы"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${Math.min(100, (charge / threshold) * 100)}%` }}
        />
      </div>

      {!ready ? (
        <p className="text-xs text-muted">
          Шкалу видишь только ты. Режь фигуры — за них дают очки.
        </p>
      ) : confirming ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBomb}
            className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-surface transition hover:bg-deep"
          >
            Сбросить
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted transition hover:text-ink"
          >
            Ещё поиграю
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!myTurn}
          className="rounded-lg border border-accent bg-tint px-3 py-2 text-sm font-semibold text-accent transition hover:bg-accent-soft/20 disabled:opacity-50"
        >
          {myTurn ? "Бомба готова" : "Бомба готова — жди хода"}
        </button>
      )}
    </div>
  );
}

function Seat({
  state,
  side,
  clockOffset,
  you,
}: {
  state: TurboStatePayload;
  side: Side;
  clockOffset: number;
  you: string;
}) {
  const player: TurboPlayerPayload | undefined = state.players.find(
    (candidate) => candidate.seat === side,
  );

  if (!player) {
    return (
      <div className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">
        {sideName(side)}: ждём игрока
      </div>
    );
  }

  const active = state.phase === "playing" && state.turn === side;

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border bg-paper p-3 ${active ? "border-accent" : "border-line"}`}
    >
      <div className="flex items-center gap-3">
        <Avatar id={player.avatarId} size={36} />
        <div className="flex-1">
          <div className="text-sm font-semibold">
            {player.nickname}
            {player.id === you ? " (ты)" : ""}
          </div>
          <div className="text-xs text-muted">
            {sideName(side)}
            {player.away ? " · вышел" : ""}
            {state.phase === "setup" && state.setupReady[side]
              ? " · готов"
              : ""}
            {/*
              Счёт взятых — у места, а не общей строкой: считать в уме, кто
              кого обогнал, посреди резни некогда.
            */}
            {state.mode === "ANNIHILATION" && state.position
              ? ` · снял фигур: ${takenCount(state.position, side)}`
              : ""}
            {state.mode === "BOOZE"
              ? ` · выпито: ${state.drinks[side] ?? 0}`
              : ""}
            {state.mode === "LAST_CHANCE" && state.position
              ? (state.position.chances[side] ?? 0) > 0
                ? " · шанс есть"
                : " · шанс истрачен"
              : ""}
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

/** Ходы парами: белые слева, чёрные справа. Отменённые — перечёркнуты. */
function Moves({
  moves,
  vetoed,
}: {
  moves: string[];
  vetoed: { ply: number; san: string }[];
}) {
  /** Что отменили перед этим полуходом. */
  const cancelled = (ply: number) =>
    vetoed.filter((one) => one.ply === ply).map((one) => one.san);

  return (
    <div className="rounded-xl border border-line bg-paper px-4 py-3">
      {moves.length === 0 ? (
        <p className="text-sm text-muted">Ходов пока нет.</p>
      ) : (
        <ol className="grid max-h-48 grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 overflow-y-auto text-sm">
          {Array.from({ length: Math.ceil(moves.length / 2) }, (_, index) => (
            <li key={index} className="contents">
              <span className="tabular text-muted">{index + 1}.</span>
              <span className="tabular">
                {cancelled(index * 2 + 1).map((san) => (
                  <s key={san} className="mr-1 text-muted">
                    {san}
                  </s>
                ))}
                {moves[index * 2]}
              </span>
              <span className="tabular">
                {cancelled(index * 2 + 2).map((san) => (
                  <s key={san} className="mr-1 text-muted">
                    {san}
                  </s>
                ))}
                {moves[index * 2 + 1] ?? ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Controls({
  claimable,
  offer,
  mySide,
  onClaim,
  onOffer,
  onDecline,
  onResign,
}: {
  claimable: boolean;
  /** Кто предложил ничью и ждёт ответа. */
  offer: Side | null;
  mySide: Side;
  onClaim: () => void;
  onOffer: () => void;
  onDecline: () => void;
  onResign: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const theirs = offer !== null && offer !== mySide;

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
              className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-surface transition hover:bg-deep"
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
          disabled={offer === mySide}
          className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {offer === mySide ? "Ничья предложена" : "Предложить ничью"}
        </button>
      )}

      {/*
        Сдача стоит отдельно от ничьей и с подтверждением: рядом эти кнопки —
        прямой путь к промаху пальцем, а цена промаха — партия.
      */}
      {confirming ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onResign}
            className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-surface transition hover:bg-deep"
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
  mySide,
  onRematch,
}: {
  state: TurboStatePayload;
  mySide: Side | null;
  onRematch: () => void;
}) {
  const { result, reason } = state;
  const title =
    result === "draw"
      ? "Ничья"
      : result === null
        ? "Партия кончилась"
        : result === mySide
          ? "Победа"
          : mySide !== null
            ? "Поражение"
            : `Победили ${sideName(result)}`;
  const full = state.players.length >= state.seats;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-accent bg-tint px-4 py-3">
      <div>
        <div className="text-sm font-semibold text-accent">{title}</div>
        <div className="text-xs text-muted">
          {reason ? REASON_TEXT[reason] : ""}
        </div>
      </div>

      {mySide !== null && full ? (
        <button
          type="button"
          onClick={onRematch}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-surface transition hover:bg-deep"
        >
          Ещё партия, местами меняемся
        </button>
      ) : mySide !== null ? (
        <p className="text-xs text-muted">
          Соперник ушёл. Позови нового — партия начнётся, как только он сядет.
        </p>
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

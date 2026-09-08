"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GameBrand } from "./Brand";
import { LeaderboardModal } from "@/games/pricetitute/components/leaderboard/LeaderboardModal";
import { UserMenu } from "@/components/UserMenu";
import { useExitWarning } from "@/components/games/ExitToShelf";
import type { Bet } from "@/games/pricetitute/engine/bet";
import { crownFor, titlesOf } from "@/games/pricetitute/engine/crowns";
import { Crown } from "./Crown";
import { MENU_LINKS } from "../menu";
import type { GameStatePayload } from "@/games/pricetitute/protocol";
import { BetInput } from "./BetInput";
import { Chat } from "@/components/room/Chat";
import { Countdown } from "@/components/ui/Countdown";
import { Finished } from "./Finished";
import { LonelyNotice } from "./LonelyNotice";
import { PlayerList } from "./PlayerList";
import { Reveal } from "./Reveal";
import { RoomPanel } from "./RoomPanel";
import { useGameRoom } from "./useGameRoom";
import { ROUTES } from "../manifest";

export function GameRoom({
  nickname,
  avatarId,
  roomCode,
  screenKey,
  isGuest = false,
}: {
  nickname: string;
  avatarId: number;
  /** Код приватной комнаты; без него садимся в общую. */
  roomCode?: string;
  /** Ключ вида «экран». Страница отдаёт его только хозяину комнаты. */
  screenKey?: string;
  /** Гость стримерской комнаты: рейтинг и переходы ему закрыты. */
  isGuest?: boolean;
}) {
  const room = useGameRoom(roomCode);
  const state = room.state;
  const [ratingOpen, setRatingOpen] = useState(false);
  const actionRef = useRef<HTMLDivElement | null>(null);

  const phase = state?.phase ?? null;
  const actionable = needsInput(state);

  // Посреди партии уход рвёт сокет и высаживает из круга ходов. Кнопку выхода
  // рисует платформа, а про идущую партию знаем только мы — вторую строку
  // вопроса передаём отсюда (docs/BACKLOG.md C3).
  useExitWarning(
    phase && phase !== "waiting" && phase !== "finished"
      ? "Партия идёт. Если выйдешь, место за столом достанется следующему."
      : null,
  );

  // Чат платформенный и про короны не знает: значок рядом с ником он получает
  // слотом, а кто его заслужил — дело игры (docs/BACKLOG.md A1).
  const titles = state ? titlesOf(state) : null;
  const chatBadge = titles
    ? (playerId: string) => {
        const crown = crownFor(playerId, titles);
        return crown ? <Crown kind={crown} className="mr-1" /> : null;
      }
    : undefined;

  // Началась фаза, где надо что-то ввести, — подтягиваем экран к полю. Только
  // если его не видно: насильную прокрутку из чата в 1.01 уже убирали (B3), и
  // повторять ту же ошибку в соседнем месте незачем.
  useEffect(() => {
    if (!actionable) return;

    const node = actionRef.current;
    if (!node) return;

    const box = node.getBoundingClientRect();
    if (box.top >= 0 && box.bottom <= window.innerHeight) return;

    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [phase, actionable]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-5">
      <header className="flex items-center justify-between gap-3">
        <Link href="/">
          <GameBrand className="text-xl" />
        </Link>

        <UserMenu
          nickname={nickname}
          avatarId={avatarId}
          isGuest={isGuest}
          links={MENU_LINKS}
          onOverlay={isGuest ? undefined : () => setRatingOpen(true)}
        />
      </header>

      <LeaderboardModal
        open={ratingOpen}
        onClose={() => setRatingOpen(false)}
      />

      {room.kicked ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-lg font-semibold">{room.kicked}</p>

          {/* Гостю идти некуда: ни общего зала, ни своей комнаты у него нет. */}
          {!isGuest && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href={ROUTES.play}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-deep"
              >
                В общую комнату
              </Link>
              <Link
                href={ROUTES.newRoom}
                className="rounded-lg border border-line bg-paper px-5 py-2.5 text-sm font-semibold transition hover:border-accent hover:text-accent"
              >
                Создать свою
              </Link>
            </div>
          )}
        </div>
      ) : null}

      {!room.connected && !room.kicked && (
        <p className="rounded-xl border border-line bg-paper px-4 py-2.5 text-center text-sm text-muted">
          Связь с сервером потеряна, восстанавливаем…
        </p>
      )}

      {room.error && (
        <p className="rounded-xl border border-accent/30 bg-tint px-4 py-2.5 text-center text-sm text-deep">
          {room.error}
        </p>
      )}

      {room.kicked ? null : state === null ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted">
          Заходим в комнату…
        </p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_300px]">
          {/*
            `min-w-0` обязателен обеим колонкам: у элемента сетки минимальная
            ширина по умолчанию равна ширине его содержимого, и любая длинная
            строка внутри (ник, ссылка, сумма) распирает колонку шире экрана.
            Без этого `truncate` внутри не срабатывает вовсе — ужиматься некуда.
          */}
          <section className="flex min-w-0 flex-col gap-4">
            <PhaseCard state={state} clockOffset={room.clockOffset} />
            <QuestionCard state={state} />
            <div ref={actionRef}>
              <ActionArea
                state={state}
                onRead={room.confirmRead}
                onAnswer={room.submitAnswer}
                onBet={room.placeBet}
                onRestart={() => void room.restart()}
                onCloseBetting={() => void room.closeBetting()}
                onInviteBots={() => void room.inviteBots()}
              />
            </div>
          </section>

          <aside className="flex min-w-0 flex-col gap-4">
            <RoomPanel
              state={state}
              screenKey={screenKey}
              onInviteBots={(count) => void room.inviteBots(count)}
              onDismissBots={() => void room.dismissBots()}
              onLock={(locked) => void room.setLocked(locked)}
            />
            <PlayerList
              state={state}
              onKick={(playerId) => void room.kick(playerId)}
              onRename={(playerId, nickname) =>
                void room.renamePlayer(playerId, nickname)
              }
            />
            <Chat
              messages={room.chat}
              youId={state.youId}
              badge={chatBadge}
              onSend={room.sendChat}
            />
          </aside>
        </div>
      )}
    </div>
  );
}

function PhaseCard({
  state,
  clockOffset,
}: {
  state: GameStatePayload;
  clockOffset: number;
}) {
  const isHost = state.hostId === state.youId;
  const host = state.players.find((player) => player.id === state.hostId);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper p-4">
      {/*
        Ник ведущего ужимается, а не распирает строку. С `shrink-0` длинный ник
        вроде «~*~ТУМАННЫЙ_ГЛЕБ~*~» растягивал карточку шире экрана, а вместе с
        ней и всю колонку: на телефоне страница начинала ездить вбок, и правые
        края кнопок ставки оказывались за краем экрана.
      */}
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="shrink-0 text-lg font-semibold">
          {title(state, isHost)}
        </h1>
        {host && !isHost && (
          <span className="min-w-0 truncate text-xs text-muted">
            ведёт {host.nickname}
          </span>
        )}
      </div>

      <Countdown
        deadline={state.deadline}
        durationMs={state.phaseDurationMs}
        clockOffset={clockOffset}
        urgent={isHost && state.phase === "host_answer"}
      />
    </div>
  );
}

function QuestionCard({ state }: { state: GameStatePayload }) {
  // В перерыве и на финальном экране вопроса нет вовсе — заглушка «его видит
  // только ведущий» там смотрелась бы враньём.
  if (state.phase === "waiting" || state.phase === "finished") return null;

  if (state.question === null) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-paper p-6 text-center text-sm text-muted">
        Вопрос сейчас видит только ведущий
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-paper p-6">
      {state.questionAdult && (
        <span className="mb-3 inline-block rounded-md bg-tint px-2 py-0.5 text-xs font-semibold text-accent">
          18+
        </span>
      )}
      <p className="text-xl font-medium leading-snug sm:text-2xl">
        {state.question}
      </p>
    </div>
  );
}

function ActionArea({
  state,
  onRead,
  onAnswer,
  onBet,
  onRestart,
  onCloseBetting,
  onInviteBots,
}: {
  state: GameStatePayload;
  onRead: () => Promise<void>;
  onAnswer: (bet: Bet) => Promise<void>;
  onBet: (bet: Bet) => Promise<void>;
  onRestart: () => void;
  onCloseBetting: () => void;
  onInviteBots: () => void;
}) {
  const isHost = state.hostId === state.youId;
  const you = state.players.find((player) => player.id === state.youId);

  switch (state.phase) {
    case "waiting": {
      // В общей комнате в одиночестве ждать бессмысленно: подсказываем, что
      // делать, вместо безнадёжного «ждём второго игрока».
      const aloneInGlobal =
        state.roomCode === null &&
        state.playerCount === 1 &&
        state.pauseReason !== "no_questions";

      if (aloneInGlobal) return <LonelyNotice />;

      return (
        <div className="flex flex-col gap-3">
          <Notice>
            {state.pauseReason === "no_questions"
              ? "Вопросы в пуле кончились. Скоро подвезём новые."
              : "Ждём второго игрока — вдвоём уже можно начинать."}
          </Notice>

          {state.canInviteBots && (
            <div className="flex flex-col gap-2 rounded-2xl border border-line bg-paper p-5 text-center">
              <p className="text-sm text-muted">
                Никого нет, а играть хочется? Позови десяток ботов. Они уйдут
                сами, как только к тебе присоединится живой человек.
              </p>
              <button
                type="button"
                onClick={onInviteBots}
                className="rounded-xl bg-accent px-4 py-3 font-semibold text-paper transition hover:bg-deep"
              >
                Forever alone
              </button>
            </div>
          )}
        </div>
      );
    }

    case "ready":
      if (!isHost) return <Notice>Ведущий читает вопрос про себя.</Notice>;
      return (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper p-5">
          <p className="text-sm text-muted">
            Прочитал вопрос? Жми — и введёшь свою сумму. Не успеешь за двадцать
            секунд, ход уйдёт следующему.
          </p>
          <button
            type="button"
            onClick={() => void onRead()}
            className="rounded-xl bg-accent px-4 py-3 text-lg font-semibold text-paper transition hover:bg-deep"
          >
            Прочитал
          </button>
        </div>
      );

    case "host_answer":
      if (!isHost) return <Notice>Ведущий вписывает свою сумму.</Notice>;
      return (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper p-5">
          <p className="text-sm text-muted">
            Сколько ты запросишь? Отвечай честно — очко получит тот, кто угадает
            ближе всех.
          </p>
          <BetInput submitLabel="Это мой ответ" onSubmit={onAnswer} />
        </div>
      );

    case "betting": {
      const own = isHost ? (
        <Notice>Игроки делают ставки. Ты уже всё сказал.</Notice>
      ) : you?.hasBet ? (
        <Notice>Ставка принята. Ждём остальных.</Notice>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper p-5">
          <p className="text-sm text-muted">
            За сколько на это согласился бы ведущий? Ставка одна, переиграть
            нельзя.
          </p>
          <BetInput submitLabel="Поставить" onSubmit={onBet} />
        </div>
      );

      // Хозяину — досрочное вскрытие. Правило «закрываем, когда поставили все»
      // на толпе не срабатывает никогда: кто-нибудь зашёл и молчит, и партию
      // держит один таймер.
      if (state.ownerId !== state.youId) return own;

      const waiting = state.players.filter(
        (player) => player.id !== state.hostId && !player.hasBet,
      ).length;

      return (
        <div className="flex flex-col gap-3">
          {own}
          <button
            type="button"
            onClick={onCloseBetting}
            className="rounded-xl border border-line bg-paper px-4 py-3 text-sm font-semibold transition hover:border-accent hover:text-accent"
          >
            {waiting === 0
              ? "Вскрываем"
              : `Вскрываем, не дожидаясь остальных (${waiting})`}
          </button>
        </div>
      );
    }

    case "reveal":
      return <Reveal state={state} />;

    case "finished":
      return <Finished state={state} onRestart={onRestart} />;
  }
}

/**
 * Есть ли прямо сейчас что вводить. Подсказка «ведущий вписывает сумму» вводом
 * не считается — подтягивать к ней экран было бы навязчиво.
 */
function needsInput(state: GameStatePayload | null): boolean {
  if (state === null) return false;

  const isHost = state.hostId === state.youId;
  const you = state.players.find((player) => player.id === state.youId);

  switch (state.phase) {
    case "ready":
    case "host_answer":
      return isHost;
    case "betting":
      return !isHost && !(you?.hasBet ?? false);
    default:
      return false;
  }
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-6 text-center text-sm text-muted">
      {children}
    </div>
  );
}

function title(state: GameStatePayload, isHost: boolean): string {
  switch (state.phase) {
    case "waiting":
      return "Перерыв";
    case "ready":
      return isHost ? "Твой ход" : "Раунд начинается";
    case "host_answer":
      return isHost ? "Назови свою сумму" : "Ведущий думает";
    case "betting":
      return isHost ? "Ставки идут" : "Угадай сумму";
    case "reveal":
      return "Вскрываем";
    case "finished":
      return "Партия окончена";
  }
}

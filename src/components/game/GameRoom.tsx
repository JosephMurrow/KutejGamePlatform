"use client";

import Link from "next/link";
import { useState } from "react";
import { Brand } from "@/components/Brand";
import { LeaderboardModal } from "@/components/leaderboard/LeaderboardModal";
import { UserMenu } from "@/components/UserMenu";
import type { Bet } from "@/lib/game/bet";
import { titlesOf } from "@/lib/game/crowns";
import type { RoomStatePayload } from "@/shared/protocol";
import { BetInput } from "./BetInput";
import { Chat } from "./Chat";
import { Countdown } from "./Countdown";
import { Finished } from "./Finished";
import { LonelyNotice } from "./LonelyNotice";
import { PlayerList } from "./PlayerList";
import { Reveal } from "./Reveal";
import { RoomPanel } from "./RoomPanel";
import { useGameRoom } from "./useGameRoom";

export function GameRoom({
  nickname,
  avatarId,
  roomCode,
}: {
  nickname: string;
  avatarId: number;
  /** Код приватной комнаты; без него садимся в общую. */
  roomCode?: string;
}) {
  const room = useGameRoom(roomCode);
  const state = room.state;
  const [ratingOpen, setRatingOpen] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-5">
      <header className="flex items-center justify-between gap-3">
        <Link href="/">
          <Brand className="text-xl" />
        </Link>

        <UserMenu
          nickname={nickname}
          avatarId={avatarId}
          onLeaderboard={() => setRatingOpen(true)}
        />
      </header>

      <LeaderboardModal
        open={ratingOpen}
        onClose={() => setRatingOpen(false)}
      />

      {room.kicked ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-lg font-semibold">{room.kicked}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/play"
              className="rounded-lg bg-crimson px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-deep"
            >
              В общую комнату
            </Link>
            <Link
              href="/rooms/new"
              className="rounded-lg border border-line bg-paper px-5 py-2.5 text-sm font-semibold transition hover:border-crimson hover:text-crimson"
            >
              Создать свою
            </Link>
          </div>
        </div>
      ) : null}

      {!room.connected && !room.kicked && (
        <p className="rounded-xl border border-line bg-paper px-4 py-2.5 text-center text-sm text-muted">
          Связь с сервером потеряна, восстанавливаем…
        </p>
      )}

      {room.error && (
        <p className="rounded-xl border border-crimson/30 bg-tint px-4 py-2.5 text-center text-sm text-deep">
          {room.error}
        </p>
      )}

      {room.kicked ? null : state === null ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted">
          Заходим в комнату…
        </p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_300px]">
          <section className="flex flex-col gap-4">
            <PhaseCard state={state} clockOffset={room.clockOffset} />
            <QuestionCard state={state} />
            <ActionArea
              state={state}
              onRead={room.confirmRead}
              onAnswer={room.submitAnswer}
              onBet={room.placeBet}
              onRestart={() => void room.restart()}
              onInviteBots={() => void room.inviteBots()}
            />
          </section>

          <aside className="flex flex-col gap-4">
            <RoomPanel
              state={state}
              onInviteBots={(count) => void room.inviteBots(count)}
              onDismissBots={() => void room.dismissBots()}
            />
            <PlayerList
              state={state}
              onKick={(playerId) => void room.kick(playerId)}
            />
            <Chat
              messages={room.chat}
              youId={state.youId}
              titles={titlesOf(state)}
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
  state: RoomStatePayload;
  clockOffset: number;
}) {
  const isHost = state.hostId === state.youId;
  const host = state.players.find((player) => player.id === state.hostId);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-semibold">{title(state, isHost)}</h1>
        {host && !isHost && (
          <span className="shrink-0 text-xs text-muted">
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

function QuestionCard({ state }: { state: RoomStatePayload }) {
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
        <span className="mb-3 inline-block rounded-md bg-tint px-2 py-0.5 text-xs font-semibold text-crimson">
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
  onInviteBots,
}: {
  state: RoomStatePayload;
  onRead: () => Promise<void>;
  onAnswer: (bet: Bet) => Promise<void>;
  onBet: (bet: Bet) => Promise<void>;
  onRestart: () => void;
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
        state.players.length === 1 &&
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
                className="rounded-xl bg-crimson px-4 py-3 font-semibold text-paper transition hover:bg-deep"
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
            className="rounded-xl bg-crimson px-4 py-3 text-lg font-semibold text-paper transition hover:bg-deep"
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

    case "betting":
      if (isHost) {
        return <Notice>Игроки делают ставки. Ты уже всё сказал.</Notice>;
      }
      if (you?.hasBet) {
        return <Notice>Ставка принята. Ждём остальных.</Notice>;
      }
      return (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper p-5">
          <p className="text-sm text-muted">
            За сколько на это согласился бы ведущий? Ставка одна, переиграть
            нельзя.
          </p>
          <BetInput submitLabel="Поставить" onSubmit={onBet} />
        </div>
      );

    case "reveal":
      return <Reveal state={state} />;

    case "finished":
      return <Finished state={state} onRestart={onRestart} />;
  }
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-6 text-center text-sm text-muted">
      {children}
    </div>
  );
}

function title(state: RoomStatePayload, isHost: boolean): string {
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

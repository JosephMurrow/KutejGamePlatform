"use client";

import { useState } from "react";
import { InviteModal } from "@/components/rooms/InviteModal";
import type { RoomStatePayload } from "@/shared/protocol";
import { hasScreen } from "@/shared/room-settings";

/** Приглашение и правила партии — видно всем, кто в приватной комнате. */
export function RoomPanel({
  state,
  screenKey,
  onInviteBots,
  onDismissBots,
  onLock,
}: {
  state: RoomStatePayload;
  /** Ключ вида «экран». Приходит только хозяину комнаты с экраном. */
  screenKey?: string;
  onInviteBots?: (count: number) => void;
  onDismissBots?: () => void;
  onLock?: (locked: boolean) => void;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);

  if (!state.roomCode) return null;

  // Адрес берём из строки браузера: снаружи и изнутри сети он разный, и
  // правильный тот, по которому человек сюда пришёл.
  const link =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/r/${state.roomCode}`;

  const screenLink =
    screenKey && link !== ""
      ? `${window.location.origin}/r/${state.roomCode}/tv?key=${screenKey}`
      : "";

  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold text-muted">
          {state.roomTitle ?? "Своя комната"}
        </h2>
        <span className="tabular shrink-0 text-sm font-bold tracking-widest text-crimson">
          {state.roomCode}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setInviteOpen(true)}
        className="w-full rounded-lg border border-line bg-blush px-3 py-2 text-sm transition hover:border-crimson hover:text-crimson"
      >
        Пригласить друга
      </button>

      {state.locked && (
        <p className="mt-3 rounded-lg border border-crimson/30 bg-tint px-3 py-2 text-xs text-deep">
          Набор закрыт: новые в комнату не войдут.
        </p>
      )}

      {/*
        Замок нужен именно стримерской: код висит в эфире, и в какой-то момент
        пускать новых хватит. Хозяин остальных комнат тоже может им щёлкнуть —
        вреда нет, а объяснять, почему кнопка есть не везде, дороже.
      */}
      {state.ownerId === state.youId && onLock && (
        <button
          type="button"
          onClick={() => onLock(!state.locked)}
          className="mt-3 w-full rounded-lg border border-line bg-blush px-3 py-2 text-sm transition hover:border-crimson hover:text-crimson"
        >
          {state.locked ? "Открыть набор" : "Закрыть набор"}
        </button>
      )}

      {screenLink !== "" && <Screen link={screenLink} />}

      {/*
        Подсказка про телефон нужна всем в комнате с экраном, а не только
        хозяину: ведущим по очереди бывает каждый, и каждому свой вопрос
        показывать залу нельзя.
      */}
      {hasScreen(state.roomKind) && (
        <p className="mt-3 rounded-lg bg-blush px-3 py-2 text-xs text-muted">
          Вопрос и своя сумма — только на твоём устройстве. Если этот экран
          видит зал, отвечай с телефона: открой ту же комнату там.
        </p>
      )}

      {state.twitchChannel && (
        <p className="mt-3 rounded-lg bg-blush px-3 py-2 text-xs text-muted">
          Чат Твича: {state.twitchChannel} ·{" "}
          {state.twitchConnected ? "на связи" : "подключаемся…"}
          <span className="mt-1 block">
            Зрители ставят командами «!10000», «!бесплатно», «!никогда».
          </span>
        </p>
      )}

      <p className="mt-3 text-xs text-muted">{rules(state)}</p>
      <p className="text-xs text-muted">
        За столом: {state.playerCount}
        {state.maxPlayers === null ? "" : ` из ${state.maxPlayers}`}
      </p>

      {state.canManageBots && onInviteBots && onDismissBots && (
        <Bots
          count={state.botCount}
          limit={state.botLimit}
          onInvite={onInviteBots}
          onDismiss={onDismissBots}
        />
      )}

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        link={link}
        hint="Наведи камеру телефона — и попадёшь прямо в эту комнату."
      />
    </div>
  );
}

/**
 * Ссылка на вид «экран». Хозяин кладёт её в источник OBS или открывает на
 * телевизоре; ключ в адресе и есть пропуск, потому что кук у OBS нет.
 */
function Screen({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="mb-2 text-xs text-muted">
        Картинка для зала: без вопроса, без ставок и без чата.
      </p>
      <button
        type="button"
        onClick={() => void copy()}
        className="w-full rounded-lg border border-line bg-blush px-3 py-2 text-sm transition hover:border-crimson hover:text-crimson"
      >
        {copied ? "Ссылка на экран скопирована" : "Скопировать ссылку на экран"}
      </button>
    </div>
  );
}

/**
 * Добор ботов хозяином. Живёт рядом с приглашением: и то и другое про то, кем
 * заполнить стол.
 */
function Bots({
  count,
  limit,
  onInvite,
  onDismiss,
}: {
  count: number;
  limit: number;
  onInvite: (count: number) => void;
  onDismiss: () => void;
}) {
  const room = limit - count;

  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="mb-2 text-xs text-muted">
        {count === 0 ? "Ботов за столом нет" : `Ботов за столом: ${count}`}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {[1, 3, 5].map((size) => (
          <button
            key={size}
            type="button"
            disabled={room < size}
            onClick={() => onInvite(size)}
            className="rounded-lg border border-line bg-blush px-2.5 py-1 text-xs transition hover:border-crimson hover:text-crimson disabled:opacity-40 disabled:hover:border-line disabled:hover:text-inherit"
          >
            +{size}
          </button>
        ))}

        {count > 0 && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-line bg-paper px-2.5 py-1 text-xs text-muted transition hover:border-crimson hover:text-crimson"
          >
            Выгнать всех
          </button>
        )}
      </div>
    </div>
  );
}

function rules(state: RoomStatePayload): string {
  const parts: string[] = [];

  if (state.endMode === "rounds" && state.endValue) {
    parts.push(`до ${state.endValue} раундов (сыграно ${state.roundsPlayed})`);
  } else if (state.endMode === "points" && state.endValue) {
    parts.push(`до ${state.endValue} очков`);
  } else {
    parts.push("играем, пока не надоест");
  }

  parts.push("счёт наружу не уходит");

  return parts.join(" · ");
}

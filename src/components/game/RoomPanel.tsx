"use client";

import { useState } from "react";
import { InviteModal } from "@/components/rooms/InviteModal";
import type { RoomStatePayload } from "@/shared/protocol";

/** Приглашение и правила партии — видно всем, кто в приватной комнате. */
export function RoomPanel({
  state,
  onInviteBots,
  onDismissBots,
}: {
  state: RoomStatePayload;
  onInviteBots?: (count: number) => void;
  onDismissBots?: () => void;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);

  if (!state.roomCode) return null;

  // Адрес берём из строки браузера: снаружи и изнутри сети он разный, и
  // правильный тот, по которому человек сюда пришёл.
  const link =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/r/${state.roomCode}`;

  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted">Своя комната</h2>
        <span className="tabular text-sm font-bold tracking-widest text-crimson">
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

      <p className="mt-3 text-xs text-muted">{rules(state)}</p>

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

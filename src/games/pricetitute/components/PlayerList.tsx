"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { crownFor, titlesOf } from "@/games/pricetitute/engine/crowns";
import { GUEST_NICKNAME_MAX } from "@/shared/guest";
import type {
  GamePlayerPayload,
  GameStatePayload,
} from "@/games/pricetitute/protocol";
import { Crown } from "./Crown";

export function PlayerList({
  state,
  onKick,
  onRename,
}: {
  state: GameStatePayload;
  /** Выгнать игрока: доступно только хозяину приватной комнаты. */
  onKick?: (playerId: string) => void;
  /**
   * Переименовать гостя. Выгнать за похабный ник можно всегда, но это
   * выкидывает человека из партии; переименование оставляет его за столом.
   */
  onRename?: (playerId: string, nickname: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const titles = titlesOf(state);
  const youAreOwner =
    state.ownerId !== null && state.ownerId === state.youId && Boolean(onKick);

  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted">
        Игроки · {state.playerCount}
      </h2>

      <ul className="flex flex-col gap-2">
        {ranked.map((player) => {
          const crown = crownFor(player.id, titles);

          return (
            <li
              key={player.id}
              className={`group flex items-center gap-3 rounded-xl px-2 py-1.5 ${
                player.id === state.youId ? "bg-tint" : ""
              }`}
            >
              <Avatar id={player.avatarId} size={36} />

              <div className="min-w-0 flex-1">
                {editing === player.id ? (
                  <Rename
                    current={player.nickname}
                    onDone={(nickname) => {
                      setEditing(null);
                      if (nickname !== null) onRename?.(player.id, nickname);
                    }}
                  />
                ) : (
                  <>
                    <p className="truncate text-sm font-medium">
                      {crown && <Crown kind={crown} className="mr-1" />}
                      {player.nickname}
                      {player.id === state.youId && (
                        <span className="ml-1 text-xs text-muted">· ты</span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {status(player, state)}
                    </p>
                  </>
                )}
              </div>

              {youAreOwner &&
                onRename &&
                player.isGuest &&
                editing !== player.id && (
                  <button
                    type="button"
                    onClick={() => setEditing(player.id)}
                    title={`Переименовать ${player.nickname}`}
                    aria-label={`Переименовать ${player.nickname}`}
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-muted opacity-0 transition hover:text-crimson focus:opacity-100 group-hover:opacity-100"
                  >
                    ✎
                  </button>
                )}

              {youAreOwner && player.id !== state.youId && (
                <button
                  type="button"
                  onClick={() => onKick?.(player.id)}
                  title={`Выгнать ${player.nickname}`}
                  aria-label={`Выгнать ${player.nickname}`}
                  className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-muted opacity-0 transition hover:text-crimson focus:opacity-100 group-hover:opacity-100"
                >
                  ✕
                </button>
              )}

              <span className="tabular shrink-0 text-sm font-semibold text-crimson">
                {player.score}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Поле переименования прямо в строке состава. */
function Rename({
  current,
  onDone,
}: {
  current: string;
  /** `null` — передумали. */
  onDone: (nickname: string | null) => void;
}) {
  const [value, setValue] = useState(current);

  return (
    <input
      autoFocus
      value={value}
      maxLength={GUEST_NICKNAME_MAX}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onDone(null)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onDone(value.trim());
        if (event.key === "Escape") onDone(null);
      }}
      className="w-full rounded-md border border-crimson bg-blush px-2 py-1 text-sm outline-none"
    />
  );
}

function status(player: GamePlayerPayload, state: GameStatePayload): string {
  if (player.id === state.ownerId) {
    return player.isHost ? "ведущий · хозяин" : "хозяин комнаты";
  }
  if (player.isHost) return "ведущий";

  if (state.phase === "betting") {
    return player.hasBet ? "поставил" : "думает";
  }

  return `раундов: ${player.roundsPlayed}`;
}

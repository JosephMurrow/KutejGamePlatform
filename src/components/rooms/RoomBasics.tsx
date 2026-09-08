"use client";

import type { ReactNode } from "react";
import {
  KIND_COPY,
  MAX_PLAYERS_LIMIT,
  MIN_PLAYERS_LIMIT,
  ROOM_KINDS,
  ROOM_TITLE_MAX,
  type RoomKind,
} from "@/shared/room-settings";

/**
 * Поля комнаты, одинаковые для любой игры: какого она рода, как называется,
 * сколько в неё пускать и чей чат слушать.
 *
 * Форму собирает игра — порядок полей и то, что стоит между ними, её дело
 * (docs/BACKLOG.md A4). Платформа даёт готовые куски, чтобы вторая игра не
 * переписывала их заново.
 */

const FIELD =
  "rounded-lg border border-line bg-blush px-3 py-2 text-sm outline-none transition focus:border-crimson";

export function RoomKindPicker({
  value,
  onChange,
}: {
  value: RoomKind;
  onChange: (kind: RoomKind) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Какая комната</legend>
      <div className="flex flex-col gap-2">
        {ROOM_KINDS.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-start gap-2.5"
          >
            <input
              type="radio"
              name="kind"
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="mt-0.5 size-4 shrink-0 accent-crimson"
            />
            <span className="text-sm">
              {KIND_COPY[option].title}
              <span className="block text-xs text-muted">
                {KIND_COPY[option].hint}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Название есть только у комнат с экраном: у обычной приватной его негде
 * показать, и спрашивать его там значило бы обещать несуществующее.
 */
export function RoomTitleField() {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Название комнаты</span>
      <input
        name="title"
        maxLength={ROOM_TITLE_MAX}
        placeholder="Стрим клёвого Толи"
        className={FIELD}
      />
      <span className="text-xs text-muted">
        Крупно на экране. Можно не заполнять.
      </span>
    </label>
  );
}

/**
 * Канал на Твиче. Что зрители смогут написать в чат — знает игра, поэтому
 * объяснение приходит снаружи.
 */
export function TwitchChannelField({ hint }: { hint: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Канал на Твиче</span>
      <input
        name="twitchChannel"
        autoComplete="off"
        placeholder="имя канала"
        className={FIELD}
      />
      <span className="text-xs text-muted">{hint}</span>
    </label>
  );
}

export function PlayerLimitField() {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Лимит игроков</span>
      <span className="flex items-center gap-2">
        {/*
          Без `tabular`: моноширинный шрифт заведён для сумм, и подсказка
          «без лимита» в нём выпирает из поля и из всей формы.
        */}
        <input
          name="maxPlayers"
          type="number"
          min={MIN_PLAYERS_LIMIT}
          max={MAX_PLAYERS_LIMIT}
          placeholder="без лимита"
          className={`w-36 ${FIELD}`}
        />
        <span className="text-sm text-muted">человек</span>
      </span>
      <span className="text-xs text-muted">
        Не больше {MAX_PLAYERS_LIMIT}. Пустое поле — без ограничения.
      </span>
    </label>
  );
}

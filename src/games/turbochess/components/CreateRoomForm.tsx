"use client";

import { useActionState, useState } from "react";
import { FormError, SubmitButton } from "@/components/ui/form";
import { RoomKindPicker, RoomTitleField } from "@/components/rooms/RoomBasics";
import { createRoomAction } from "@/lib/rooms/actions";
import { hasScreen, type RoomKind } from "@/shared/room-settings";
import { PLAYER_MODES } from "../modes/catalog";
import { GAME_ID } from "../protocol";
import {
  TIME_CONTROL_LABEL,
  defaultRoomSettings,
  type TimeControl,
} from "../rooms/settings";

/**
 * Форма своей партии.
 *
 * Главное в ней — режим: он выбирается здесь и по ходу партии не меняется.
 * Ручки режимов появятся на их этапах, каждая согласуется отдельно
 * (docs/MODES.md). Служебная «Классика» в списке не значится. Время на ход —
 * как у шахмат. Платформенные поля — род комнаты и название — берутся
 * готовыми.
 *
 * Лимита мест здесь нет намеренно. Платформенное `maxPlayers` отбивает само
 * подключение, а не посадку, и с ним лишний — зритель — получил бы «нет
 * свободных мест». Места держит движок: двое, в королевской битве четверо.
 */
const TIME_CONTROLS = Object.keys(TIME_CONTROL_LABEL) as TimeControl[];

/** Что даёт каждый контроль времени, кроме секунд. */
const TIME_HINT: Record<TimeControl, string> = {
  SEC_10: "пуля: думать некогда",
  SEC_30: "быстро, но успеваешь",
  MIN_1: "есть время посчитать",
  MIN_3: "спокойная партия",
  UNLIMITED: "часы не заводятся вовсе",
};

export function CreateRoomForm() {
  const [state, formAction] = useActionState(createRoomAction, {});
  const [kind, setKind] = useState<RoomKind>("private");
  const defaults = defaultRoomSettings();

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="game" value={GAME_ID} />

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Режим</legend>
        <div className="flex flex-col gap-2.5">
          {PLAYER_MODES.map((mode) => (
            <label
              key={mode.id}
              className="flex cursor-pointer items-start gap-2.5"
            >
              <input
                type="radio"
                name="mode"
                value={mode.id}
                defaultChecked={mode.id === defaults.mode}
                className="mt-0.5 size-4 shrink-0 accent-accent"
              />
              <span className="text-sm">
                {mode.title}
                {mode.seats > 2 ? (
                  <span className="text-muted"> · {mode.seats} игрока</span>
                ) : null}
                <span className="block text-xs text-muted">{mode.short}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Сколько на ход</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TIME_CONTROLS.map((control) => (
            <label
              key={control}
              className="flex cursor-pointer items-start gap-2.5"
            >
              <input
                type="radio"
                name="timeControl"
                value={control}
                defaultChecked={control === defaults.timeControl}
                className="mt-0.5 size-4 shrink-0 accent-accent"
              />
              <span className="text-sm">
                {TIME_CONTROL_LABEL[control]}
                <span className="block text-xs text-muted">
                  {TIME_HINT[control]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <RoomKindPicker value={kind} onChange={setKind} />
      {hasScreen(kind) ? <RoomTitleField /> : null}

      <FormError>{state.error}</FormError>
      <SubmitButton>Создать комнату</SubmitButton>
    </form>
  );
}

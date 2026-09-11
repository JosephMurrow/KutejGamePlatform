"use client";

import { useActionState, useState } from "react";
import { FormError, SubmitButton } from "@/components/ui/form";
import { RoomKindPicker, RoomTitleField } from "@/components/rooms/RoomBasics";
import { createRoomAction } from "@/lib/rooms/actions";
import { hasScreen, type RoomKind } from "@/shared/room-settings";
import { MODES } from "../modes/catalog";
import { GAME_ID } from "../protocol";
import { defaultRoomSettings } from "../rooms/settings";

/**
 * Форма своей партии.
 *
 * Главное в ней — режим: он выбирается здесь и по ходу партии не меняется.
 * Ручки режимов появятся на их этапах, каждая согласуется отдельно
 * (docs/MODES.md). Платформенные поля — род комнаты и название — берутся
 * готовыми.
 *
 * Лимита мест здесь нет намеренно. Платформенное `maxPlayers` отбивает само
 * подключение, а не посадку, и с ним лишний — зритель — получил бы «нет
 * свободных мест». Места держит движок: двое, в королевской битве четверо.
 */
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
          {MODES.map((mode) => (
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

      <RoomKindPicker value={kind} onChange={setKind} />
      {hasScreen(kind) ? <RoomTitleField /> : null}

      <FormError>{state.error}</FormError>
      <SubmitButton>Создать комнату</SubmitButton>
    </form>
  );
}

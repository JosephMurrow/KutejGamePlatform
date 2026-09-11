"use client";

import { useActionState, useState } from "react";
import { FormError, SubmitButton } from "@/components/ui/form";
import { RoomKindPicker, RoomTitleField } from "@/components/rooms/RoomBasics";
import { createRoomAction } from "@/lib/rooms/actions";
import { hasScreen, type RoomKind } from "@/shared/room-settings";
import { PLAYER_MODES, type TurboMode } from "../modes/catalog";
import {
  ONE_KINDS,
  ONE_KIND_FIELD,
  ONE_KIND_LABEL,
  oneKindOf,
} from "../modes/oneKind";
import { isReady } from "../modes/rules";
import { GAME_ID } from "../protocol";
import { pieceSrc } from "./pieces";
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
  const [mode, setMode] = useState<TurboMode>(defaults.mode);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="game" value={GAME_ID} />

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Режим</legend>
        <div className="flex flex-col gap-2.5">
          {PLAYER_MODES.map((info) => (
            <div key={info.id} className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="radio"
                  name="mode"
                  value={info.id}
                  checked={mode === info.id}
                  onChange={() => setMode(info.id)}
                  className="mt-0.5 size-4 shrink-0 accent-accent"
                />
                <span className="text-sm">
                  {info.title}
                  {info.seats > 2 ? (
                    <span className="text-muted"> · {info.seats} игрока</span>
                  ) : null}
                  {isReady(info.id) ? null : (
                    <span className="text-muted"> · скоро</span>
                  )}
                  <span className="block text-xs text-muted">{info.short}</span>
                </span>
              </label>

              {/* Ручки режима — прямо под ним, только когда он выбран. */}
              {mode === "ONE_KIND" && info.id === "ONE_KIND" ? (
                <OneKindPicker />
              ) : null}
            </div>
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

/**
 * Каким видом играть в «Одним видом фигур». Картинками, а не словами: фигуры
 * у игры свои, и узнать их по рисунку проще, чем по названию.
 */
function OneKindPicker() {
  const initial = oneKindOf(defaultRoomSettings().options);

  return (
    <fieldset className="ml-6.5">
      <legend className="sr-only">Каким видом фигур играть</legend>
      <div className="grid grid-cols-5 gap-1.5">
        {ONE_KINDS.map((kind) => (
          <label
            key={kind}
            className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-line bg-surface p-1.5 text-xs text-muted transition has-checked:border-accent has-checked:bg-tint has-checked:text-ink"
          >
            <input
              type="radio"
              name={ONE_KIND_FIELD}
              value={kind}
              defaultChecked={kind === initial}
              className="sr-only"
            />
            {/* Правило зовёт `next/image`, но файлы уже нужного размера. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pieceSrc("w", kind)}
              alt=""
              width={256}
              height={256}
              className="size-10"
            />
            {ONE_KIND_LABEL[kind]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

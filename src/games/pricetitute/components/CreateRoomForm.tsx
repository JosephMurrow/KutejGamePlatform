"use client";

import { useActionState, useState } from "react";
import { FormError, SubmitButton } from "@/components/ui/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import {
  adultChoiceApplies,
  MODE_COPY,
  QUESTION_MODES,
  type QuestionMode,
} from "@/games/pricetitute/questions/modes";
import { createRoomAction } from "@/lib/rooms/actions";
import { hasScreen, type RoomKind } from "@/shared/room-settings";
import {
  PlayerLimitField,
  RoomKindPicker,
  RoomTitleField,
  TwitchChannelField,
} from "@/components/rooms/RoomBasics";
import { GAME_ID } from "@/games/pricetitute/protocol";
import {
  BETTING_CHOICES,
  DEFAULT_BETTING_MS,
  DEFAULT_REVEAL_MS,
  defaultRotation,
  HOST_ROTATIONS,
  REVEAL_CHOICES,
  ROTATION_COPY,
  type Choice,
  type HostRotation,
} from "@/games/pricetitute/rooms/settings";

export function CreateRoomForm() {
  const [state, formAction] = useActionState(
    createRoomAction,
    EMPTY_FORM_STATE,
  );
  const [endMode, setEndMode] = useState<"endless" | "rounds" | "points">(
    "endless",
  );
  const [mode, setMode] = useState<QuestionMode>("normal");
  const [kind, setKind] = useState<RoomKind>("private");
  // `null` — человек к переключателю не притрагивался, значит предлагаем то,
  // что уместно выбранной комнате: за столом водят по очереди, в эфире — хозяин.
  const [rotation, setRotation] = useState<HostRotation | null>(null);
  const hostRotation = rotation ?? defaultRotation(kind);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="game" value={GAME_ID} />

      <FormError>{state.error}</FormError>

      <RoomKindPicker value={kind} onChange={setKind} />

      {kind !== "private" && <RoomTitleField />}

      <Durations
        legend="Время на ставки"
        name="bettingMs"
        choices={BETTING_CHOICES}
        selected={DEFAULT_BETTING_MS}
      />

      <Durations
        legend="Сколько показывать вскрышку"
        name="revealMs"
        choices={REVEAL_CHOICES}
        selected={DEFAULT_REVEAL_MS}
      />

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Какие вопросы</legend>
        <div className="flex flex-col gap-2">
          {QUESTION_MODES.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-start gap-2.5"
            >
              <input
                type="radio"
                name="mode"
                value={option}
                checked={mode === option}
                onChange={() => setMode(option)}
                className="mt-0.5 size-4 shrink-0 accent-crimson"
              />
              <span className="text-sm">
                {MODE_COPY[option].title}
                <span className="block text-xs text-muted">
                  {MODE_COPY[option].hint}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {kind === "stream" && (
        <TwitchChannelField
          hint={
            <>
              Зрители смогут ставить прямо из чата: «!10000», «!бесплатно»,
              «!никогда». Разрешений это не требует — достаточно имени канала.
              Но ставка в чате видна всем, в отличие от ставки в игре.
            </>
          }
        />
      )}

      {kind !== "private" && <PlayerLimitField />}

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Кто ведёт</legend>
        <div className="flex flex-col gap-2">
          {HOST_ROTATIONS.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-start gap-2.5"
            >
              <input
                type="radio"
                name="hostRotation"
                value={option}
                checked={hostRotation === option}
                onChange={() => setRotation(option)}
                className="mt-0.5 size-4 shrink-0 accent-crimson"
              />
              <span className="text-sm">
                {ROTATION_COPY[option].title}
                <span className="block text-xs text-muted">
                  {ROTATION_COPY[option].hint}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Когда заканчиваем</legend>
        <div className="flex flex-col gap-2">
          <Choice
            name="endMode"
            value="endless"
            checked={endMode === "endless"}
            onSelect={() => setEndMode("endless")}
          >
            Играем, пока не надоест
          </Choice>
          <Choice
            name="endMode"
            value="rounds"
            checked={endMode === "rounds"}
            onSelect={() => setEndMode("rounds")}
          >
            До определённого числа раундов
          </Choice>
          <Choice
            name="endMode"
            value="points"
            checked={endMode === "points"}
            onSelect={() => setEndMode("points")}
          >
            Пока кто-нибудь не наберёт очки
          </Choice>
        </div>

        {endMode !== "endless" && (
          <label className="mt-3 flex items-center gap-3">
            <span className="text-sm text-muted">
              {endMode === "rounds" ? "Раундов" : "Очков"}
            </span>
            <input
              name="endValue"
              type="number"
              min={1}
              max={99}
              defaultValue={endMode === "rounds" ? 10 : 5}
              className="tabular w-20 rounded-lg border border-line bg-blush px-3 py-2 text-center outline-none transition focus:border-crimson"
            />
          </label>
        )}
      </fieldset>

      {/*
        Экран рисуем мы, а отвечает за картинку хозяин канала: откровенные паки
        крупным планом в эфире — прямое нарушение правил площадок. Предупреждаем
        честно и не мешаем (см. src/games/pricetitute/docs/BACKLOG.md O6).
      */}
      {hasScreen(kind) && mode !== "normal" && (
        <p className="rounded-lg border border-crimson/30 bg-tint px-3 py-2 text-xs text-deep">
          Эти вопросы попадут на экран целиком. Если экран уходит в трансляцию,
          учти: за содержимое картинки площадка спросит с тебя, а не с игры.
        </p>
      )}

      {/*
        Галочка живёт только в обычном режиме. В остальных всё содержимое
        взрослое по определению, и выключать там нечего.
      */}
      {adultChoiceApplies(mode) && (
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="includeAdult"
            defaultChecked
            className="mt-0.5 size-4 shrink-0 accent-crimson"
          />
          <span className="text-muted">
            Включить вопросы 18+. Без галочки в комнате будут только безобидные.
          </span>
        </label>
      )}

      <SubmitButton>Создать комнату</SubmitButton>
    </form>
  );
}

/** Ряд кнопок-переключателей с длительностью. */
function Durations({
  legend,
  name,
  choices,
  selected,
}: {
  legend: string;
  name: string;
  choices: readonly Choice[];
  selected: number;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <label key={choice.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={choice.value}
              defaultChecked={choice.value === selected}
              className="peer sr-only"
            />
            <span className="block rounded-lg border border-line bg-paper px-4 py-2 text-sm transition peer-checked:border-crimson peer-checked:bg-crimson peer-checked:text-paper">
              {choice.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Choice({
  name,
  value,
  checked,
  onSelect,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="size-4 accent-crimson"
      />
      <span>{children}</span>
    </label>
  );
}

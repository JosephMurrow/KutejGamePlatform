"use client";

import { useActionState, useState } from "react";
import { FormError, SubmitButton } from "@/components/ui/form";
import { RoomKindPicker, RoomTitleField } from "@/components/rooms/RoomBasics";
import { createRoomAction } from "@/lib/rooms/actions";
import { hasScreen, type RoomKind } from "@/shared/room-settings";
import { GAME_ID } from "../protocol";
import {
  TIME_CONTROL_LABEL,
  VIEWER_DELAY_LABEL,
  defaultRoomSettings,
  type TimeControl,
  type ViewerDelay,
} from "../rooms/settings";
import { LEVELS, levelsFor } from "../bots/levels";

/**
 * Форма своей партии.
 *
 * Платформенные поля берутся готовыми: род комнаты и название. Свои — время на
 * ход, соперник и режим стримера (src/games/chess/docs/BACKLOG.md C1).
 *
 * Лимита мест здесь нет намеренно. Платформенное `maxPlayers` отбивает само
 * подключение, а не посадку, и с ним третий — зритель — получил бы «нет
 * свободных мест». Два места держит движок через `seated()`.
 */

const TIME_CONTROLS = Object.keys(TIME_CONTROL_LABEL) as TimeControl[];
const VIEWER_DELAYS = Object.keys(VIEWER_DELAY_LABEL) as ViewerDelay[];

/** Что даёт каждый контроль времени, кроме секунд. */
const TIME_HINT: Record<TimeControl, string> = {
  SEC_10: "пуля: думать некогда",
  SEC_30: "как в общем зале",
  MIN_1: "есть время посчитать",
  MIN_3: "спокойная партия",
  UNLIMITED: "часы не заводятся вовсе",
};

export function CreateRoomForm({
  expertWins = 0,
}: {
  /** Побед над «экспертом»: от них зависит, есть ли в списке пятый уровень. */
  expertWins?: number;
}) {
  const [state, formAction] = useActionState(createRoomAction, {});
  const [kind, setKind] = useState<RoomKind>("private");
  const [opponent, setOpponent] = useState<"HUMAN" | "BOT">("HUMAN");
  const defaults = defaultRoomSettings();
  // Скрытый уровень не значится в списке, пока его не открыли. Сервер проверяет
  // это ещё раз: форме верить нельзя (src/games/chess/docs/BACKLOG.md D3).
  const levels = levelsFor(expertWins);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="game" value={GAME_ID} />

      <RoomKindPicker value={kind} onChange={setKind} />
      {hasScreen(kind) ? <RoomTitleField /> : null}

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

      <fieldset>
        <legend className="mb-2 text-sm font-medium">С кем играешь</legend>
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="radio"
              name="opponent"
              value="HUMAN"
              checked={opponent === "HUMAN"}
              onChange={() => setOpponent("HUMAN")}
              className="mt-0.5 size-4 shrink-0 accent-accent"
            />
            <span className="text-sm">
              С человеком
              <span className="block text-xs text-muted">
                позовёшь по ссылке; кто придёт первым, тот и играет
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="radio"
              name="opponent"
              value="BOT"
              checked={opponent === "BOT"}
              onChange={() => setOpponent("BOT")}
              className="mt-0.5 size-4 shrink-0 accent-accent"
            />
            <span className="text-sm">
              С ботом
              <span className="block text-xs text-muted">
                садится сразу и ждать никого не надо
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      {opponent === "BOT" ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            Насколько сильный
          </legend>
          <div className="flex flex-col gap-2">
            {levels.map((id) => (
              <label
                key={id}
                className="flex cursor-pointer items-start gap-2.5"
              >
                <input
                  type="radio"
                  name="botLevel"
                  value={id.toUpperCase()}
                  defaultChecked={id === "normal"}
                  className="mt-0.5 size-4 shrink-0 accent-accent"
                />
                <span className="text-sm">
                  {LEVELS[id].title}
                  <span className="block text-xs text-muted">
                    {LEVELS[id].hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          name="streamerMode"
          className="mt-0.5 size-4 shrink-0 accent-accent"
        />
        <span className="text-sm">
          Режим стримера
          <span className="block text-xs text-muted">
            гасит подсказки и подсветку выбранной фигуры: в записи не видно, что
            ты задумал
          </span>
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Задержка для зрителей</span>
        <select
          name="viewerDelay"
          defaultValue={defaults.viewerDelay}
          className="rounded-lg border border-line bg-paper px-3 py-2 text-sm"
        >
          {VIEWER_DELAYS.map((delay) => (
            <option key={delay} value={delay}>
              {VIEWER_DELAY_LABEL[delay]}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">
          зритель на сайте видит ход мгновенно, а зритель эфира — с опозданием;
          задержка не даёт подсказать сопернику в чате трансляции
        </span>
      </label>

      <FormError>{state.error}</FormError>
      <SubmitButton>Создать комнату</SubmitButton>
    </form>
  );
}

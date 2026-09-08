"use server";

import { redirect } from "next/navigation";
import { createGuest } from "../auth/guest";
import { getSessionUserId, startSession } from "../auth/session";
import type { FormState } from "../auth/form-state";
import { allowsGuests, ROOM_CODE_LENGTH } from "@/shared/room-settings";
import { defaultGameServer, gameServerById } from "@/lib/games/servers";
import {
  createPrivateRoom,
  findPrivateRoom,
  normalizeSettings,
} from "./private";

export async function createRoomAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/login?next=/games/pricetitute/rooms/new");
  }

  // Платформа разбирает только своё. Что за поля у игры и что они значат,
  // знает она сама — форму ей передаём как есть (docs/BACKLOG.md A4).
  const settings = normalizeSettings({
    kind: formData.get("kind"),
    title: formData.get("title"),
    maxPlayers: formData.get("maxPlayers"),
    twitchChannel: formData.get("twitchChannel"),
  });

  const asked = formData.get("game");
  const game =
    typeof asked === "string" && asked !== ""
      ? gameServerById(asked)
      : defaultGameServer();
  if (!game) return { error: "Неизвестная игра" };

  let code: string;
  try {
    const room = await createPrivateRoom(userId, settings, game.id);
    await game.saveRoomSettings(room.id, formData);
    code = room.code;
  } catch (error) {
    console.error("Не удалось создать комнату:", error);
    return { error: "Комната не создалась. Попробуй ещё раз." };
  }

  redirect(`/r/${code}`);
}

/**
 * Вход гостем в стримерскую комнату.
 *
 * Зритель не пойдёт регистрироваться ради одного раунда, поэтому здесь всего
 * два поля: ник и подтверждение возраста. Возраст спрашиваем именно тут —
 * регистрации, где стоит галочка 18+, у гостя не было.
 */
export async function joinAsGuestAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const code = String(formData.get("code") ?? "");
  const nickname = String(formData.get("nickname") ?? "");
  const adult = formData.get("adult") === "on";
  const values = { nickname, adult: adult ? "on" : "" };

  const room = await findPrivateRoom(code);
  if (!room || !allowsGuests(room.kind)) {
    return { values, error: "В эту комнату гостем не пускают" };
  }

  if (!adult) {
    return {
      values,
      fieldErrors: {
        adult: "Без подтверждения возраста играть нельзя — вопросы взрослые",
      },
    };
  }

  const result = await createGuest(room.id, nickname);
  if (!result.ok) {
    return { values, fieldErrors: { nickname: result.reason } };
  }

  await startSession(result.guest.id, true);
  redirect(`/r/${room.code}`);
}

/**
 * Вход по коду. Комнату ищем сразу: сказать «такой комнаты нет» на этом экране
 * честнее, чем увести человека на страницу с 404.
 */
export async function joinByCodeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();

  if (code.length !== ROOM_CODE_LENGTH) {
    return {
      values: { code },
      error: `Код — это ${ROOM_CODE_LENGTH} символов`,
    };
  }

  const room = await findPrivateRoom(code);
  if (!room) {
    return {
      values: { code },
      error: "Такой комнаты нет. Проверь код — его легко списать с ошибкой.",
    };
  }

  redirect(`/r/${room.code}`);
}

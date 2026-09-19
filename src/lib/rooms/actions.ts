"use server";

import { redirect } from "next/navigation";
import { countGuestsIn, createGuest, MAX_GUESTS_PER_ROOM } from "../auth/guest";
import { RateLimiter } from "../../server/rate-limit";
import { sessionMemberId, startSession } from "../auth/session";
import type { FormState } from "../auth/form-state";
import { allowsGuests, ROOM_CODE_LENGTH } from "@/shared/room-settings";
import { defaultGameServer, gameServerById } from "@/lib/games/servers";
import { requestAddress } from "../request-address";
import { CODE_BLOCKED_REASON, findRoomByCode } from "./code-guard";
import {
  countRoomsOf,
  createPrivateRoom,
  MAX_ROOMS_PER_HOST,
  normalizeSettings,
} from "./private";

/**
 * Гостевых входов с одного адреса в час (docs/SECURITY.md, S-D3). Считаются
 * состоявшиеся. Гость, вернувшийся со своей сессией, сюда не приходит — его
 * пускает страница комнаты.
 */
const guestLimiter = new RateLimiter(5, 60 * 60 * 1000);

export async function createRoomAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Комнату заводит только полноценный игрок: гость заведён ради чужой
  // комнаты, и своих у него нет (docs/SECURITY.md, S-C1).
  const userId = await sessionMemberId();
  if (!userId) {
    // На витрину, а не в форму конкретной игры: платформенный экшен не обязан
    // знать, чью комнату заводили (src/games/chess/docs/BACKLOG.md A4).
    redirect("/login?next=/games");
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

  // Квота живых комнат (docs/SECURITY.md, S-D2): иначе экшеном в цикле
  // заводится сколько угодно строк в базе. Пустые комнаты уходят сами через
  // полчаса, так что упереться в квоту обычным путём трудно.
  if ((await countRoomsOf(userId)) >= MAX_ROOMS_PER_HOST) {
    return {
      error:
        `У тебя уже ${MAX_ROOMS_PER_HOST} комнат. Пустые закрываются сами ` +
        "через полчаса — зайди в нужную или подожди.",
    };
  }

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

  const lookup = await findRoomByCode(code, await requestAddress());
  if (lookup.blocked) return { values, error: CODE_BLOCKED_REASON };

  const room = lookup.room;
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

  // Гостевой вход заводит строку в базе, поэтому лимитирован
  // (docs/SECURITY.md, S-D3): с адреса — как у регистрации, на комнату —
  // потолок, выше которого за стол всё равно не посадить.
  const address = await requestAddress();
  if (guestLimiter.blocked(address)) {
    return {
      values,
      error:
        "С этого адреса уже заходили несколько гостей. Попробуй через час.",
    };
  }
  if ((await countGuestsIn(room.id)) >= MAX_GUESTS_PER_ROOM) {
    return { values, error: "В комнате уже слишком много гостей" };
  }

  const result = await createGuest(room.id, nickname);
  if (!result.ok) {
    return { values, fieldErrors: { nickname: result.reason } };
  }
  guestLimiter.hit(address);

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

  const lookup = await findRoomByCode(code, await requestAddress());
  if (lookup.blocked) return { values: { code }, error: CODE_BLOCKED_REASON };

  const room = lookup.room;
  if (!room) {
    return {
      values: { code },
      error: "Такой комнаты нет. Проверь код — его легко списать с ошибкой.",
    };
  }

  redirect(`/r/${room.code}`);
}

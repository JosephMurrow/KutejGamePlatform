"use server";

import { redirect } from "next/navigation";
import { getSessionUserId } from "../auth/session";
import type { FormState } from "../auth/form-state";
import { createPrivateRoom, normalizeSettings } from "./private";

export async function createRoomAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/login?next=/rooms/new");
  }

  const settings = normalizeSettings({
    bettingMs: formData.get("bettingMs"),
    revealMs: formData.get("revealMs"),
    includeAdult: formData.get("includeAdult") === "on",
    mode: formData.get("mode"),
    endMode: formData.get("endMode"),
    endValue: formData.get("endValue"),
  });

  let code: string;
  try {
    const room = await createPrivateRoom(userId, settings);
    code = room.code;
  } catch (error) {
    console.error("Не удалось создать комнату:", error);
    return { error: "Комната не создалась. Попробуй ещё раз." };
  }

  redirect(`/r/${code}`);
}

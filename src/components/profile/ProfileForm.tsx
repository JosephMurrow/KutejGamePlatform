"use client";

import { useActionState, useState } from "react";
import { Avatar, avatarName } from "@/components/Avatar";
import { Field, FormError, FormOk, SubmitButton } from "@/components/ui/form";
import { updateProfileAction } from "@/lib/auth/actions";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { AVATAR_COUNT } from "@/lib/avatars";

export function ProfileForm({
  nickname,
  avatarId,
}: {
  nickname: string;
  avatarId: number;
}) {
  const [state, formAction] = useActionState(
    updateProfileAction,
    EMPTY_FORM_STATE,
  );
  const [selected, setSelected] = useState(avatarId);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormError>{state.error}</FormError>
      <FormOk>{state.ok}</FormOk>

      <Field
        label="Ник"
        name="nickname"
        defaultValue={state.values?.nickname ?? nickname}
        error={state.fieldErrors?.nickname}
      />

      <div>
        <p className="mb-2 text-sm text-muted">Аватар</p>
        <input type="hidden" name="avatarId" value={selected} />
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
          {Array.from({ length: AVATAR_COUNT }, (_, id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSelected(id)}
              aria-label={avatarName(id)}
              title={avatarName(id)}
              aria-pressed={selected === id}
              // Размер задаёт кнопка, а не картинка: аватары грузятся лениво,
              // и до загрузки `<img>` не занимает места — без своей высоты
              // сетка складывалась в кашу.
              className={`aspect-square w-full rounded-full transition ${
                selected === id
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-paper"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              <Avatar id={id} size={44} className="size-full" />
            </button>
          ))}
        </div>
        {state.fieldErrors?.avatarId && (
          <p className="mt-1 text-xs text-accent">
            {state.fieldErrors.avatarId}
          </p>
        )}
      </div>

      <SubmitButton>Сохранить</SubmitButton>
    </form>
  );
}

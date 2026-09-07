"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/ui/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { joinByCodeAction } from "@/lib/rooms/actions";
import { ROOM_CODE_LENGTH } from "@/shared/room-settings";

/**
 * Одно поле под код комнаты.
 *
 * Код набирают с телевизора или с трансляции, поэтому поле крупное и с
 * разрядкой: так видно, сколько символов уже введено. Регистр не важен —
 * приводится на сервере.
 */
export function JoinByCodeForm() {
  const [state, formAction] = useActionState(
    joinByCodeAction,
    EMPTY_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError>{state.error}</FormError>

      <input
        name="code"
        autoFocus
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={ROOM_CODE_LENGTH}
        defaultValue={state.values?.code}
        placeholder="ABC123"
        aria-label="Код комнаты"
        className="tabular w-full rounded-xl border border-line bg-blush px-4 py-4 text-center text-3xl font-bold uppercase tracking-[0.3em] outline-none transition placeholder:text-muted/40 focus:border-crimson"
      />

      <SubmitButton>Зайти</SubmitButton>
    </form>
  );
}

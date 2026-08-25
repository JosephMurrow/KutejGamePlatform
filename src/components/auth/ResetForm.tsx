"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import { resetPasswordAction } from "@/lib/auth/actions";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";

export function ResetForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(
    resetPasswordAction,
    EMPTY_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError>{state.error}</FormError>

      <input type="hidden" name="token" value={token} />

      <Field
        label="Новый пароль"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Минимум 8 символов."
        error={state.fieldErrors?.password}
      />

      <SubmitButton>Сменить пароль и войти</SubmitButton>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import { requestResetAction } from "@/lib/auth/actions";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";

export function ForgotForm() {
  const [state, formAction] = useActionState(
    requestResetAction,
    EMPTY_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError>{state.error}</FormError>

      {state.ok && (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-muted">
          {state.ok}
        </p>
      )}

      <Field
        label="Логин или почта"
        name="identity"
        autoComplete="username"
        defaultValue={state.values?.identity}
        hint="Письмо уйдёт, только если адрес аккаунта подтверждён."
        error={state.fieldErrors?.identity}
      />

      <SubmitButton>Прислать ссылку</SubmitButton>
    </form>
  );
}

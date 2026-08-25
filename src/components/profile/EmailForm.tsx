"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import { attachEmailAction } from "@/lib/auth/actions";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";

/**
 * Почта в профиле: прикрепить, сменить, переслать письмо.
 *
 * Отдельной карточкой от ника с аватаром: адрес — это способ вернуть себе
 * аккаунт, а не оформление.
 */
export function EmailForm({
  email,
  confirmed,
}: {
  email: string | null;
  confirmed: boolean;
}) {
  const [state, formAction] = useActionState(
    attachEmailAction,
    EMPTY_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError>{state.error}</FormError>

      {state.ok && (
        <p className="rounded-xl border border-line bg-blush px-4 py-2.5 text-sm text-muted">
          {state.ok}
        </p>
      )}

      {email === null ? (
        <p className="text-sm leading-relaxed text-muted">
          Почта не указана. Без неё забытый пароль восстановить нечем — заводить
          новый аккаунт придётся с нуля, вместе со счётом в рейтинге.
        </p>
      ) : confirmed ? (
        <p className="text-sm text-muted">
          Адрес подтверждён: <span className="text-ink">{email}</span>. Пароль
          можно восстановить по письму.
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-muted">
          Адрес <span className="text-ink">{email}</span> ещё не подтверждён.
          Пока это так, восстановить пароль по нему нельзя — перейди по ссылке
          из письма или запроси новое.
        </p>
      )}

      <Field
        label={email === null ? "Почта" : "Другой адрес"}
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email ?? email ?? ""}
        error={state.fieldErrors?.email}
      />

      <SubmitButton>
        {email === null ? "Прикрепить и подтвердить" : "Отправить письмо"}
      </SubmitButton>
    </form>
  );
}

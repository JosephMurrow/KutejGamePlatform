"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import {
  changePasswordAction,
  logoutEverywhereAction,
} from "@/lib/auth/actions";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";

/**
 * Безопасность в профиле: смена пароля и выход на всех устройствах
 * (docs/SECURITY.md, S-B5).
 *
 * Две формы, а не одна: выйти везде можно и не помня пароль — например, если
 * забыл телефон у друга, — а сменить пароль без текущего нельзя.
 */
export function SecurityForm() {
  const [password, changePassword] = useActionState(
    changePasswordAction,
    EMPTY_FORM_STATE,
  );
  const [everywhere, logoutEverywhere] = useActionState(
    logoutEverywhereAction,
    EMPTY_FORM_STATE,
  );

  return (
    <div className="flex flex-col gap-8">
      <form action={changePassword} className="flex flex-col gap-4">
        <FormError>{password.error}</FormError>
        <Notice>{password.ok}</Notice>

        <Field
          label="Текущий пароль"
          name="current"
          type="password"
          autoComplete="current-password"
          error={password.fieldErrors?.current}
        />
        <Field
          label="Новый пароль"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="Минимум 8 символов. На остальных устройствах придётся войти заново."
          error={password.fieldErrors?.password}
        />

        <SubmitButton>Сменить пароль</SubmitButton>
      </form>

      <form action={logoutEverywhere} className="flex flex-col gap-3">
        <FormError>{everywhere.error}</FormError>
        <Notice>{everywhere.ok}</Notice>

        <p className="text-sm leading-relaxed text-muted">
          Забыл выйти на чужом телефоне или в клубе? Здесь закрываются все
          сессии, кроме этой.
        </p>
        <SubmitButton>Выйти на всех устройствах</SubmitButton>
      </form>
    </div>
  );
}

function Notice({ children }: { children?: string }) {
  if (!children) return null;

  return (
    <p className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-muted">
      {children}
    </p>
  );
}

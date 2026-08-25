"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/lib/auth/actions";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { Field, FormError, SubmitButton } from "@/components/ui/form";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(loginAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError>{state.error}</FormError>

      {next && <input type="hidden" name="next" value={next} />}

      <Field
        label="Логин"
        name="login"
        autoComplete="username"
        defaultValue={state.values?.login}
        error={state.fieldErrors?.login}
      />

      <Field
        label="Пароль"
        name="password"
        type="password"
        autoComplete="current-password"
        error={state.fieldErrors?.password}
      />

      <p className="-mt-2 text-right text-xs">
        <Link
          href="/forgot"
          className="text-muted hover:text-crimson hover:underline"
        >
          Забыл пароль?
        </Link>
      </p>

      <SubmitButton>Войти</SubmitButton>

      <p className="text-center text-sm text-muted">
        Нет аккаунта?{" "}
        <Link href="/register" className="text-crimson hover:underline">
          Зарегистрироваться
        </Link>
      </p>
    </form>
  );
}

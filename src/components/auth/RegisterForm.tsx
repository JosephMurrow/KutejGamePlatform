"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction } from "@/lib/auth/actions";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { Field, FormError, SubmitButton } from "@/components/ui/form";

export function RegisterForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(registerAction, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError>{state.error}</FormError>

      {next && <input type="hidden" name="next" value={next} />}

      <Field
        label="Логин"
        name="login"
        autoComplete="username"
        defaultValue={state.values?.login}
        hint="3–20 символов: латиница, цифры, подчёркивание"
        error={state.fieldErrors?.login}
      />

      <Field
        label="Почта"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        hint="Нужна, чтобы восстановить забытый пароль. Входить всё равно по логину."
        error={state.fieldErrors?.email}
      />

      <Field
        label="Пароль"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Минимум 8 символов."
        error={state.fieldErrors?.password}
      />

      <Field
        label="Ник"
        name="nickname"
        autoComplete="nickname"
        defaultValue={state.values?.nickname}
        hint="Так тебя увидят в игре. Может отличаться от логина."
        error={state.fieldErrors?.nickname}
      />

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="adult"
          defaultChecked={state.values?.adult === "on"}
          className="mt-0.5 size-4 shrink-0 accent-crimson"
        />
        <span className="text-muted">
          Мне есть 18 лет. Понимаю, что вопросы бывают откровенными.
        </span>
      </label>
      {state.fieldErrors?.adult && (
        <p className="-mt-2 text-xs text-crimson">{state.fieldErrors.adult}</p>
      )}

      <SubmitButton>Зарегистрироваться</SubmitButton>

      <p className="text-center text-sm text-muted">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="text-crimson hover:underline">
          Войти
        </Link>
      </p>
    </form>
  );
}

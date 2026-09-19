"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/ui/form";
import { confirmEmailAction } from "@/lib/auth/actions";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";

/**
 * Подтверждение почты кнопкой (docs/SECURITY.md, S-B6). Ссылку гасит нажатие,
 * а не открытие страницы: предпросмотр в мессенджере и почтовый сканер
 * открывают её раньше человека.
 */
export function ConfirmForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(
    confirmEmailAction,
    EMPTY_FORM_STATE,
  );

  if (state.ok) {
    return (
      <div className="flex flex-col items-center gap-5">
        <h1 className="text-xl font-semibold">Адрес подтверждён</h1>
        <p className="mx-auto max-w-sm text-balance text-sm leading-relaxed text-muted">
          {state.ok}
        </p>
        <Link
          href="/games"
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-deep"
        >
          К играм
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <h1 className="text-xl font-semibold">Подтверждение адреса</h1>
      <p className="mx-auto max-w-sm text-balance text-sm leading-relaxed text-muted">
        Нажми кнопку — и забытый пароль можно будет восстановить по этой почте.
      </p>

      <FormError>{state.error}</FormError>
      <input type="hidden" name="token" value={token} />

      <SubmitButton>Подтвердить адрес</SubmitButton>
    </form>
  );
}

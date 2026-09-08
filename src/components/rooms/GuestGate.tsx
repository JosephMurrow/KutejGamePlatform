"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Brand } from "@/components/Brand";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { GUEST_NICKNAME_MAX } from "@/shared/guest";
import { joinAsGuestAction } from "@/lib/rooms/actions";

/**
 * Дверь в стримерскую комнату для незалогиненного: войти, зарегистрироваться
 * или играть гостем.
 *
 * Гость — не поблажка, а условие жизнеспособности эфирной комнаты: зритель не
 * пойдёт заводить аккаунт ради одного раунда. Взамен он получает только эту
 * комнату: ни общего зала, ни рейтинга, ни профиля (см. src/games/pricetitute/docs/BACKLOG.md O3).
 */
export function GuestGate({
  code,
  title,
}: {
  code: string;
  /** Название комнаты, чтобы человек видел, куда пришёл. */
  title: string | null;
}) {
  const [state, formAction] = useActionState(
    joinAsGuestAction,
    EMPTY_FORM_STATE,
  );

  const next = `/r/${code}`;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <Link href="/">
          <Brand className="h-12" />
        </Link>
        <h1 className="mt-4 text-2xl font-bold">
          {title ?? "Заходи в комнату"}
        </h1>
        <p className="tabular mt-1 text-sm tracking-widest text-accent">
          {code}
        </p>
      </div>

      <form
        action={formAction}
        className="flex flex-col gap-4 rounded-2xl border border-line bg-paper p-6"
      >
        <input type="hidden" name="code" value={code} />

        <FormError>{state.error}</FormError>

        <Field
          label="Как тебя звать"
          name="nickname"
          defaultValue={state.values?.nickname}
          hint={`До ${GUEST_NICKNAME_MAX} символов. Этот ник увидит весь зал.`}
          error={state.fieldErrors?.nickname}
        />

        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="adult"
            defaultChecked={state.values?.adult === "on"}
            className="mt-0.5 size-4 shrink-0 accent-accent"
          />
          <span className="text-muted">
            Мне есть восемнадцать. Вопросы в игре взрослые и местами
            откровенные.
          </span>
        </label>
        {state.fieldErrors?.adult && (
          <p className="-mt-2 text-xs text-accent">{state.fieldErrors.adult}</p>
        )}

        <SubmitButton>Играть гостем</SubmitButton>

        <p className="text-center text-xs text-muted">
          Гостевой профиль живёт, пока живёт комната: очки останутся здесь, в
          общий рейтинг они не идут, и после партии от гостя ничего не
          останется.
        </p>
      </form>

      <div className="flex flex-col gap-2 text-center text-sm">
        <p className="text-muted">Уже есть аккаунт?</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="flex-1 rounded-xl border border-line bg-paper px-4 py-2.5 font-semibold transition hover:border-accent hover:text-accent"
          >
            Войти
          </Link>
          <Link
            href={`/register?next=${encodeURIComponent(next)}`}
            className="flex-1 rounded-xl border border-line bg-paper px-4 py-2.5 font-semibold transition hover:border-accent hover:text-accent"
          >
            Зарегистрироваться
          </Link>
        </div>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Предупреждение на входе в комнату с чернотой.
 *
 * Это предупреждение, а не защита доступа: согласие живёт в браузере. Серверная
 * проверка тут ничего не добавит — комната и так открывается только по ссылке,
 * а ссылку человеку дал тот, кто его позвал.
 */
export function HardcoreGate({
  code,
  children,
}: {
  code: string;
  children: React.ReactNode;
}) {
  // На сервере хранилища нет, поэтому первый снимок — null: до ответа лучше
  // не мигать ни игрой, ни предупреждением. Хранилище тут внешнее состояние,
  // и читается оно тем, чем положено, а не эффектом со setState.
  const agreed = useSyncExternalStore(
    subscribe,
    useCallback(() => read(code), [code]),
    () => null,
  );

  function accept() {
    try {
      window.localStorage.setItem(key(code), "1");
    } catch {
      // Приватный режим браузера — тогда просто переспросим в другой раз.
    }
    emit();
  }

  if (agreed === null) return null;
  if (agreed) return children;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 items-center px-4 py-8">
      <div className="flex w-full flex-col gap-4 rounded-2xl border-2 border-crimson bg-paper p-6">
        <h1 className="text-xl font-bold">Тут будет совсем жёстко</h1>

        <p className="text-sm leading-relaxed text-muted">
          Хозяин этой комнаты включил самые чёрные вопросы: похабщина,
          физиология, унижение и темы, о которых обычно не говорят вслух. Это
          игра для взрослых, которые понимают, куда идут, и знают друг друга.
        </p>
        <p className="text-sm leading-relaxed text-muted">
          Если ты тут по ссылке от знакомого и не знаешь, во что ввязываешься, —
          спокойно уходи в общий зал, там играют обычными вопросами.
        </p>

        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={accept}
            className="flex-1 rounded-xl bg-crimson px-4 py-3 text-sm font-semibold text-paper transition hover:bg-deep"
          >
            Я понимаю
          </button>
          <Link
            href="/play"
            className="flex-1 rounded-xl border border-line bg-paper px-4 py-3 text-center text-sm font-semibold transition hover:border-crimson hover:text-crimson"
          >
            Я на такое не согласен
          </Link>
        </div>
      </div>
    </main>
  );
}

const listeners = new Set<() => void>();

/** Слушаем и своё согласие, и чужую вкладку: там могли согласиться раньше. */
function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  window.addEventListener("storage", notify);

  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

function emit(): void {
  for (const notify of listeners) notify();
}

/** Согласие помнится по комнате: иначе обновление страницы переспрашивало бы. */
function key(code: string): string {
  return `pricetitute:hardcore:${code}`;
}

function read(code: string): boolean {
  try {
    return window.localStorage.getItem(key(code)) === "1";
  } catch {
    return false;
  }
}

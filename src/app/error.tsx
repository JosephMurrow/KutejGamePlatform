"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Страница упала:", error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <Brand className="h-10" />

      <div>
        <h1 className="text-xl font-semibold">Что-то сломалось</h1>
        <p className="mt-2 max-w-sm text-balance text-sm text-muted">
          Мы уже знаем об этом. Попробуй обновить — обычно помогает.
        </p>
        {error.digest && (
          <p className="tabular mt-2 text-xs text-muted">код: {error.digest}</p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-deep"
        >
          Попробовать снова
        </button>
        <Link
          href="/"
          className="rounded-lg border border-line bg-paper px-5 py-2.5 text-sm font-semibold transition hover:border-accent hover:text-accent"
        >
          На главную
        </Link>
      </div>
    </main>
  );
}

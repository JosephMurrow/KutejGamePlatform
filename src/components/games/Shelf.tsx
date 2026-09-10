import Link from "next/link";
import { PLATFORM_TAGLINE } from "@/lib/brand";
import { GAMES } from "@/lib/games/registry";

/**
 * Полка с играми.
 *
 * Коробку рисует сама игра: форму даёт платформа, цвета и крышку — игра
 * (docs/BOX.md). Игра без коробки на полку не выходит — это часть приёмки.
 */
export function Shelf() {
  return (
    <section>
      <h1 className="mb-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Во что играем
      </h1>
      <p className="mb-9 max-w-lg text-sm text-muted">{PLATFORM_TAGLINE}</p>

      <ul className="flex flex-col gap-5">
        {GAMES.map((game) => (
          <li key={game.id}>
            <Link
              href={game.routes.home}
              className="flex flex-col gap-5 rounded-3xl border border-line bg-paper p-5 shadow-lg shadow-black/20 transition hover:border-accent sm:flex-row sm:items-stretch sm:gap-7 sm:p-6"
            >
              <game.Box className="w-full shrink-0 sm:w-72" />

              <span className="flex flex-col justify-center gap-2.5">
                <span className="flex items-center gap-2.5">
                  <span className="text-2xl font-bold tracking-tight">
                    {game.title}
                  </span>
                  {game.adult && (
                    <span className="rounded-md bg-[#d31450] px-1.5 py-0.5 text-xs font-bold text-white">
                      18+
                    </span>
                  )}
                </span>
                <span className="max-w-md text-sm text-muted">
                  {game.tagline}
                </span>
                <span className="mt-1 inline-flex w-fit items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-surface">
                  Играть
                </span>
              </span>
            </Link>
          </li>
        ))}

        {/*
          Пустую полку не рисуем: одинокая коробка читается как ошибка, а не
          как полка (docs/BACKLOG.md C2).
        */}
        <li className="flex flex-col items-center justify-center gap-1 rounded-3xl border border-dashed border-line p-8 text-center sm:min-h-44">
          <span className="text-base font-semibold text-muted">Скоро</span>
          <span className="text-xs text-muted/70">
            Здесь встанет следующая игра
          </span>
        </li>
      </ul>
    </section>
  );
}

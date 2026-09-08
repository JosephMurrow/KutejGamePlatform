import Link from "next/link";
import { GAMES } from "@/lib/games/registry";

/**
 * Полка с играми.
 *
 * Оформления здесь пока нет: коробки — черновые карточки. Настоящий формат —
 * горизонтальная коробка от настолки в теме своей игры — рисуется на этапе 7,
 * и до одобрения хозяином в код не едет (docs/DESIGN.md, правило D0).
 */
export function Shelf() {
  return (
    <section>
      <h1 className="mb-1 text-2xl font-bold">Во что играем</h1>
      <p className="mb-6 text-sm text-muted">
        Игры для компании: заходите с телефонов, ведущий — по очереди или всегда
        один.
      </p>

      <ul className="grid gap-4 sm:grid-cols-2">
        {GAMES.map((game) => (
          <li key={game.id}>
            <Link
              href={game.routes.home}
              className="flex h-full flex-col justify-between gap-3 rounded-2xl border border-line bg-paper p-5 transition hover:border-crimson"
            >
              <span>
                <span className="flex items-center gap-2">
                  <span className="text-lg font-bold">{game.title}</span>
                  {game.adult && (
                    <span className="rounded-md bg-crimson px-1.5 py-0.5 text-xs font-bold text-paper">
                      18+
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-sm text-muted">
                  {game.tagline}
                </span>
              </span>
              <span className="text-sm font-semibold text-crimson">
                Играть →
              </span>
            </Link>
          </li>
        ))}

        {/*
          Пустую полку не рисуем: одинокая карточка читается как ошибка, а не
          как полка (docs/BACKLOG.md C2).
        */}
        <li className="flex h-full min-h-32 flex-col justify-center gap-1 rounded-2xl border border-dashed border-line p-5 text-center">
          <span className="text-sm font-semibold text-muted">Скоро</span>
          <span className="text-xs text-muted">
            Здесь встанет следующая игра
          </span>
        </li>
      </ul>
    </section>
  );
}

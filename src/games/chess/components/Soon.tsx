import { ButtonLink } from "@/components/ui/Button";
import { ROUTES } from "../manifest";

/**
 * Страница, которой ещё нет.
 *
 * Скелет заводит все четыре адреса игры сразу — иначе меню и витрина ведут в
 * никуда, — но зал, форма партии и рейтинг приходят своими этапами
 * (src/games/chess/docs/PLAN.md, этапы 5, 6 и 9). Честная заглушка лучше
 * пустой страницы: видно, что адрес живой, а не сломан.
 */
export function Soon({ title, text }: { title: string; text: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-sm text-balance text-sm leading-relaxed text-muted">
          {text}
        </p>
      </div>

      <ButtonLink href={ROUTES.home} look="secondary">
        К правилам
      </ButtonLink>
    </main>
  );
}

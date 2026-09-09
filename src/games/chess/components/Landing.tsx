import { ButtonLink } from "@/components/ui/Button";
import { CHESS, ROUTES } from "../manifest";

/**
 * Первая страница шахмат: что это за игра и куда идти дальше.
 *
 * Открыта и незалогиненному — во что тут играют, человек смотрит до всякой
 * регистрации; войти просят на пороге стола, а не на пороге правил
 * (docs/BACKLOG.md C1).
 */

const RULES = [
  {
    title: "Обычные шахматы",
    text: "Те самые, без выдумок: рокировка, взятие на проходе, превращение — всё на месте.",
  },
  {
    title: "Часы на каждый ход",
    text: "Время даётся не на партию, а на ход. Не успел — флаг, и партия кончилась.",
  },
  {
    title: "Двое за столом, зрителей сколько угодно",
    text: "Мест ровно два. Остальные смотрят партию целиком, но подсказать не могут.",
  },
];

export function Landing() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-12 px-6 py-14">
      <div className="flex flex-col items-center gap-5 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {CHESS.title}
        </h1>
        <p className="max-w-lg text-balance text-lg leading-relaxed text-muted">
          {CHESS.tagline}
        </p>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href={ROUTES.play}>В общий зал</ButtonLink>
          <ButtonLink href={ROUTES.newRoom} look="secondary">
            Своя партия
          </ButtonLink>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        {RULES.map(({ title, text }) => (
          <div
            key={title}
            className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-5"
          >
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-sm leading-relaxed text-muted">{text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

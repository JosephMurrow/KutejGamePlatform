import { ButtonLink } from "@/components/ui/Button";
import { PLAYER_MODES } from "../modes/catalog";
import { PIECE_KINDS, PIECE_NAME, pieceSrc } from "./pieces";
import { ROUTES, TURBOCHESS } from "../manifest";

/**
 * Первая страница турбо-шахмат: что это за игра и какие в ней режимы.
 *
 * Открыта и незалогиненному — во что тут играют, человек смотрит до всякой
 * регистрации; войти просят на пороге стола, а не на пороге правил (так же у
 * шахмат).
 */
export function Landing() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-12 px-6 py-14">
      <div className="flex flex-col items-center gap-5 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {TURBOCHESS.title}
        </h1>
        <p className="max-w-lg text-balance text-lg leading-relaxed text-muted">
          {TURBOCHESS.tagline}
        </p>
        <p className="max-w-lg text-balance text-sm leading-relaxed text-muted">
          Доска и фигуры узнаваемые, правила — нет. Общего зала здесь нет:
          заводишь комнату, выбираешь режим и зовёшь соперника по ссылке.
        </p>

        <ButtonLink href={ROUTES.newRoom} className="mt-2">
          Своя партия
        </ButtonLink>
      </div>

      {/*
        Состав: фигуры с листа хозяина. Каждая колонка — вид фигуры, светлая
        над тёмной, как на листе.
      */}
      <section className="mx-auto grid w-full max-w-xl grid-cols-6 gap-x-1 sm:gap-x-3">
        {PIECE_KINDS.map((kind) => (
          <figure key={kind} className="flex flex-col items-center gap-1">
            {(["w", "b"] as const).map((color) => (
              // Правило зовёт `next/image`, но файлы уже нужного размера, а
              // размер задаёт колонка — оптимизатору тут нечего делать. Так
              // же сделано у фигур шахмат и у платформенного аватара.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={color}
                src={pieceSrc(color, kind)}
                alt=""
                width={256}
                height={256}
                className="h-auto w-full max-w-20"
              />
            ))}
            <figcaption className="text-xs text-muted">
              {PIECE_NAME[kind]}
            </figcaption>
          </figure>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {PLAYER_MODES.map((mode) => (
          <div
            key={mode.id}
            className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-5"
          >
            <h2 className="text-sm font-semibold">
              <span className="text-muted">{mode.number}.</span> {mode.title}
            </h2>
            <p className="text-sm leading-relaxed text-muted">{mode.short}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

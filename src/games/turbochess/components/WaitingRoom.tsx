import { modeInfo, type TurboMode } from "../modes/catalog";
import { TURBOCHESS } from "../manifest";

/**
 * Комната до доски: показывает, что стол поднялся и во что тут играют.
 *
 * Это временная страница скелета. Доска, часы и ходы встанут на её место
 * вместе со своим движком и сетевой партией (docs/PLAN.md, этапы 3–5), а до
 * тех пор комната обязана хотя бы открываться и не падать.
 */
export function WaitingRoom({
  code,
  mode,
  screen = false,
}: {
  code: string;
  mode: TurboMode;
  /** Вид «экран»: те же сведения, но крупнее и без обращения к игроку. */
  screen?: boolean;
}) {
  const info = modeInfo(mode);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="flex flex-col gap-3">
        <h1
          className={`font-semibold tracking-tight ${screen ? "text-5xl" : "text-3xl"}`}
        >
          {TURBOCHESS.title}
        </h1>
        <p
          className={`text-balance text-muted ${screen ? "text-xl" : "text-sm"}`}
        >
          {TURBOCHESS.tagline}
        </p>
      </div>

      <div className="flex max-w-md flex-col gap-1.5 rounded-xl border border-line bg-paper px-6 py-5">
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">
          Режим {info.number}
        </span>
        <span className="text-lg font-semibold">{info.title}</span>
        <span className="text-sm leading-relaxed text-balance text-muted">
          {info.short}
        </span>
      </div>

      <dl className="flex flex-col gap-2 rounded-xl border border-line bg-paper px-6 py-4 text-sm">
        <div className="flex items-center justify-between gap-8">
          <dt className="text-muted">За столом</dt>
          <dd className="font-semibold">{info.seats} игрока</dd>
        </div>
        <div className="flex items-center justify-between gap-8">
          <dt className="text-muted">Комната</dt>
          <dd className="tabular font-semibold">{code}</dd>
        </div>
      </dl>

      <p className="max-w-sm text-balance text-sm text-muted">
        Стол готов, доски пока нет: свой движок и фигуры приедут следующими
        этапами.
      </p>
    </main>
  );
}

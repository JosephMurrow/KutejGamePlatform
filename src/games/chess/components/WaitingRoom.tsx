import { TIME_CONTROL_LABEL, type TimeControl } from "../rooms/store";

/**
 * Комната до доски: показывает, что стол поднялся и чем тут играют.
 *
 * Это временная страница скелета. Доска, часы и список ходов встанут на её
 * место вместе с клиентом (src/games/chess/docs/PLAN.md, этап 4), а до тех пор
 * комната обязана хотя бы открываться и не падать.
 */
export function WaitingRoom({
  code,
  timeControl,
  screen = false,
}: {
  /** Код приватной комнаты; у общего зала его нет. */
  code: string | null;
  timeControl: TimeControl;
  /** Вид «экран»: те же сведения, но крупнее и без обращения к игроку. */
  screen?: boolean;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="flex flex-col gap-3">
        <h1
          className={`font-semibold tracking-tight ${screen ? "text-5xl" : "text-3xl"}`}
        >
          Шахматы
        </h1>
        <p
          className={`text-balance text-muted ${screen ? "text-xl" : "text-sm"}`}
        >
          Величайшая война в истории, запертая на 64 клетках
        </p>
      </div>

      <dl className="flex flex-col gap-2 rounded-xl border border-line bg-paper px-6 py-4 text-sm">
        <div className="flex items-center justify-between gap-8">
          <dt className="text-muted">На ход</dt>
          <dd className="font-semibold">{TIME_CONTROL_LABEL[timeControl]}</dd>
        </div>
        {code ? (
          <div className="flex items-center justify-between gap-8">
            <dt className="text-muted">Комната</dt>
            <dd className="tabular font-semibold">{code}</dd>
          </div>
        ) : null}
      </dl>

      <p className="max-w-sm text-balance text-sm text-muted">
        Стол готов, доски пока нет: правила и фигуры приедут следующими этапами.
      </p>
    </main>
  );
}

import { modeInfo, type TurboMode } from "../modes/catalog";
import { LocalGame } from "./LocalGame";

/**
 * Стол в комнате, пока партии по сети нет: режим, код комнаты и доска на
 * одном экране (docs/PLAN.md, этапы 4 и 5).
 *
 * Правила пока обычные — режимы встают на свои этапы, — и об этом сказано
 * прямо: игрок, выбравший «Загул», не должен гадать, почему ничего не
 * случается.
 */
export function LocalTable({ code, mode }: { code: string; mode: TurboMode }) {
  const info = modeInfo(mode);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 pl-12 lg:pl-0">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold tracking-wide text-muted uppercase">
            Режим {info.number}
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">
            {info.title}
          </h1>
          <p className="text-sm text-muted">{info.short}</p>
        </div>
        <p className="text-sm text-muted">
          Комната <span className="tabular font-semibold text-ink">{code}</span>
        </p>
      </header>

      <p className="rounded-xl border border-line bg-tint px-4 py-3 text-sm">
        Пока доска за одним экраном и правила обычные: партия по сети —
        следующим этапом, правила режима — на его этапе.
      </p>

      <LocalGame />
    </main>
  );
}

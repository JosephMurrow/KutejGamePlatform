"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

/** Дорога с игры на витрину. Она одна и всегда одна и та же. */
const SHELF = "/games";

const LABEL = "Выйти в меню выбора игр";

/**
 * Игра сообщает, что уход сейчас чего-то стоит. Платформа подставит текст
 * второй строкой в вопросе.
 *
 * Контекст, а не свойство, потому что кнопку рисует платформа снаружи игры, а
 * знает про идущую партию только сама игра, изнутри.
 */
const ExitWarning = createContext<((note: string | null) => void) | null>(null);

/**
 * Предупреждение к выходу. `null` — обычный вопрос без второй строки.
 */
export function useExitWarning(note: string | null): void {
  const set = useContext(ExitWarning);

  useEffect(() => {
    set?.(note);
    // Ушли со страницы — предупреждение снимается вместе с ней.
    return () => set?.(null);
  }, [set, note]);
}

/**
 * Выход из игры на витрину: кнопка в левом верхнем углу поддерева игры.
 *
 * Раньше выход жил пунктом в меню пользователя, и это была дыра: незалогиненный
 * человек меню не видит вовсе, а страница игры ему открыта — уйти он мог только
 * кнопкой «назад» в браузере (docs/BACKLOG.md C3).
 *
 * Спрашиваем всегда, а не только посреди партии: кнопка стоит в углу, попасть
 * по ней случайно легко, а цена промаха — вылет из-за стола.
 */
export function GameExit({ children }: { children: ReactNode }) {
  const [note, setNote] = useState<string | null>(null);

  return (
    <ExitWarning.Provider value={setNote}>
      <div className="px-3 pt-3">
        <ExitButton note={note} />
      </div>
      {children}
    </ExitWarning.Provider>
  );
}

function ExitButton({ note }: { note: string | null }) {
  const [asking, setAsking] = useState(false);

  return (
    <div className="group relative w-fit">
      <button
        type="button"
        aria-label={LABEL}
        onClick={() => setAsking(true)}
        className="flex size-9 items-center justify-center rounded-xl border border-line bg-paper text-muted transition hover:border-accent hover:text-accent"
      >
        <DoorIcon />
      </button>

      {/*
        Подпись всплывает и на наведении, и на фокусе с клавиатуры: иначе
        человек, идущий табом, видит голую иконку без объяснения. Для читалки
        она не нужна — там работает aria-label, поэтому подпись скрыта.

        Пока открыт вопрос, подписи нет: курсор всё ещё над кнопкой, и она
        висела бы из-под затемнения.
      */}
      {!asking && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-full z-40 mt-1.5 whitespace-nowrap rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs text-muted opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        >
          {LABEL}
        </span>
      )}

      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        title="Выйти в меню выбора игр?"
      >
        <div className="p-4">
          <p className="text-sm">
            Вы уверены, что хотите вернуться на страницу выбора игр?
          </p>

          {note && <p className="mt-2 text-sm text-muted">{note}</p>}

          <div className="mt-4 flex gap-2">
            <ButtonLink href={SHELF}>Выйти</ButtonLink>
            <Button
              type="button"
              look="secondary"
              onClick={() => setAsking(false)}
            >
              Остаться
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/**
 * Приоткрытая дверь и стрелка наружу.
 *
 * Дверь дана створкой в перспективе, а не проёмом: на двадцати точках у
 * контурного проёма от двери остаётся прямоугольник, и знак перестаёт читаться.
 * Стрелка смотрит влево, туда же, куда уводит кнопка.
 */
function DoorIcon() {
  const line = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;

  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M9.4 3.9 L16.6 2.4a.9.9 0 0 1 1.1.9v17.4a.9.9 0 0 1-1.1.9L9.4 20.1a.9.9 0 0 1-.7-.9V4.8a.9.9 0 0 1 .7-.9Z"
        {...line}
      />
      <circle cx="14.6" cy="12" r="1.1" fill="currentColor" />
      <path d="M6 12H1.6 M3.9 9.7 L1.6 12 L3.9 14.3" {...line} />
    </svg>
  );
}

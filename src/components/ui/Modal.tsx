"use client";

import { useEffect, useRef } from "react";

/**
 * Модальное окно поверх страницы.
 *
 * Внутри — родной `<dialog>` с `showModal()`. Он сам уводит остальную страницу
 * в inert, сам держит фокус внутри, сам закрывается по Esc и сам возвращает
 * фокус на кнопку. Рукописная ловушка фокуса делала бы то же самое хуже.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Заголовок окна. Он же связан с окном для читалки с экрана. */
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  // Открытие и закрытие — это обращение к внешнему API элемента, ровно то,
  // ради чего эффекты и существуют.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Пока окно открыто, фон не прокручивается: на телефоне иначе уезжает
  // страница под окном, а не список внутри него.
  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        // Esc: гасим родное закрытие и закрываемся через состояние, иначе
        // React и элемент разойдутся в том, открыто окно или нет.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Клик мимо: сам `<dialog>` растянут на весь экран, поэтому попадание
        // ровно в него и означает промах по содержимому.
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-0 max-h-none max-w-none bg-transparent p-0 backdrop:bg-ink/50 open:flex open:h-full open:w-full open:items-end open:justify-center sm:open:items-center"
    >
      <div className="flex max-h-full w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-paper sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-muted">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="-mr-1 rounded-md px-2 py-0.5 text-lg leading-none text-muted transition hover:text-accent"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}

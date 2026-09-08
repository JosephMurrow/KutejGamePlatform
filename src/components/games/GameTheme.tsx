import type { ReactNode } from "react";

/**
 * Поддерево игры со своей темой.
 *
 * Токены платформы стоят по умолчанию; здесь те же имена перебиваются
 * значениями игры (см. globals.css). Поэтому полка не красит игру, а игра не
 * красит полку (docs/BACKLOG.md D1).
 *
 * Фон рисует сама обёртка: иначе за короткой страницей игры просвечивал бы
 * фиолетовый фон платформы.
 */
export function GameTheme({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <div data-game={id} className="flex flex-1 flex-col bg-surface text-ink">
      {children}
    </div>
  );
}

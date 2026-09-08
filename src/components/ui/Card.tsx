import type { ReactNode } from "react";

/**
 * Карточка платформы: поверхность с рамкой и скруглением.
 *
 * Тот же набор классов повторялся по страницам десятками; здесь он один.
 */
export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-paper p-5 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

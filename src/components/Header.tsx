import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Шапка страницы: знак слева, всё остальное справа.
 *
 * Раньше эта строка была повторена разметкой на четырёх страницах. Знак
 * приходит снаружи: на платформенных страницах он платформенный, на страницах
 * игры — её.
 */
export function Header({
  brand,
  brandHref = "/",
  children,
}: {
  brand: ReactNode;
  brandHref?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-center justify-between gap-3">
      <Link href={brandHref}>{brand}</Link>
      {children}
    </header>
  );
}

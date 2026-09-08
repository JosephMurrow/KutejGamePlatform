import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * Кнопка платформы: ссылка или обычная кнопка, три вида.
 *
 * До этого один и тот же набор классов был размножен копипастой по страницам,
 * и любая правка вида требовала обхода всех. Игра своими кнопками
 * распоряжается сама — здесь только платформенные поверхности.
 */
export type ButtonLook = "primary" | "secondary" | "quiet";

const LOOK: Record<ButtonLook, string> = {
  primary:
    "bg-accent text-surface font-semibold transition hover:bg-deep hover:text-surface",
  secondary:
    "border border-line bg-paper font-medium transition hover:border-accent",
  quiet: "text-muted transition hover:text-accent",
};

const SIZE = "rounded-xl px-5 py-2.5 text-sm";

function classes(look: ButtonLook, className?: string): string {
  return `inline-flex w-fit items-center justify-center ${SIZE} ${LOOK[look]} ${className ?? ""}`;
}

export function ButtonLink({
  look = "primary",
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & { look?: ButtonLook; children: ReactNode }) {
  return (
    <Link className={classes(look, className)} {...rest}>
      {children}
    </Link>
  );
}

export function Button({
  look = "primary",
  className,
  children,
  ...rest
}: ComponentProps<"button"> & { look?: ButtonLook; children: ReactNode }) {
  return (
    <button className={classes(look, className)} {...rest}>
      {children}
    </button>
  );
}

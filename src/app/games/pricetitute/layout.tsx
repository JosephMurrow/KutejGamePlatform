import { GameTheme } from "@/components/games/GameTheme";
import { GAME_ID } from "@/games/pricetitute/protocol";
import { PRICETITUTE } from "@/games/pricetitute/manifest";
import type { Viewport } from "next";

/**
 * Цвет шапки внутри игры — её собственный: вложенный `viewport` перебивает
 * корневой, и полоса статуса перестаёт спорить со светлой страницей игры
 * (docs/BACKLOG.md B3).
 */
export const viewport: Viewport = { themeColor: PRICETITUTE.themeColor };

/** Все страницы платитутки — в её теме. */
export default function PricetituteLayout({
  children,
}: LayoutProps<"/games/pricetitute">) {
  return <GameTheme id={GAME_ID}>{children}</GameTheme>;
}

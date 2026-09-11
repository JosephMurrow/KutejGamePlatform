import { GameTheme } from "@/components/games/GameTheme";
import { GAME_ID } from "@/games/chess/protocol";
import { CHESS } from "@/games/chess/manifest";
import type { Viewport } from "next";

/**
 * Цвет шапки внутри игры — её собственный: вложенный `viewport` перебивает
 * корневой, и полоса статуса перестаёт спорить со светлой страницей игры
 * (docs/BACKLOG.md B3).
 */
export const viewport: Viewport = { themeColor: CHESS.themeColor };

/** Все страницы шахмат — в их теме. */
export default function ChessLayout({ children }: LayoutProps<"/games/chess">) {
  return <GameTheme id={GAME_ID}>{children}</GameTheme>;
}

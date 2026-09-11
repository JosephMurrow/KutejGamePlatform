import type { Viewport } from "next";
import { GameTheme } from "@/components/games/GameTheme";
import { GAME_ID } from "@/games/turbochess/protocol";
import { TURBOCHESS } from "@/games/turbochess/manifest";

/**
 * Цвет шапки внутри игры — её собственный: вложенный `viewport` перебивает
 * корневой (docs/BACKLOG.md B3).
 */
export const viewport: Viewport = { themeColor: TURBOCHESS.themeColor };

/** Все страницы турбо-шахмат — в их теме. */
export default function TurboChessLayout({
  children,
}: LayoutProps<"/games/turbochess">) {
  return <GameTheme id={GAME_ID}>{children}</GameTheme>;
}

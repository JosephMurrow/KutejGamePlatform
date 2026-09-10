import { GameTheme } from "@/components/games/GameTheme";
import { GAME_ID } from "@/games/chess/protocol";

/** Все страницы шахмат — в их теме. */
export default function ChessLayout({ children }: LayoutProps<"/games/chess">) {
  return <GameTheme id={GAME_ID}>{children}</GameTheme>;
}

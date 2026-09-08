import { GameTheme } from "@/components/games/GameTheme";
import { GAME_ID } from "@/games/pricetitute/protocol";

/** Все страницы платитутки — в её теме. */
export default function PricetituteLayout({
  children,
}: LayoutProps<"/games/pricetitute">) {
  return <GameTheme id={GAME_ID}>{children}</GameTheme>;
}

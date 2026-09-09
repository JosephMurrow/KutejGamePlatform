import type { Metadata } from "next";
import { Landing } from "@/games/chess/components/Landing";
import { CHESS } from "@/games/chess/manifest";

export const metadata: Metadata = {
  title: CHESS.title,
};

export default function ChessPage() {
  return <Landing />;
}

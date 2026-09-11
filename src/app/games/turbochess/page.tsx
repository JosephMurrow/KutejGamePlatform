import type { Metadata } from "next";
import { Landing } from "@/games/turbochess/components/Landing";
import { TURBOCHESS } from "@/games/turbochess/manifest";

export const metadata: Metadata = {
  title: TURBOCHESS.title,
};

export default function TurboChessPage() {
  return <Landing />;
}

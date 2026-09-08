import type { Metadata } from "next";
import { BRAND } from "@/components/Brand";
import { Landing } from "@/games/pricetitute/components/Landing";

export const metadata: Metadata = {
  title: BRAND,
};

export default function PricetitutePage() {
  return <Landing />;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BRAND } from "@/games/pricetitute/components/Brand";
import { GameRoom } from "@/games/pricetitute/components/GameRoom";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: `Общая комната — ${BRAND}`,
};

export default async function PlayPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return <GameRoom nickname={user.nickname} avatarId={user.avatarId} />;
}

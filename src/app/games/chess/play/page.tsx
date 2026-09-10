import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { GameRoom } from "@/games/chess/components/GameRoom";
import { CHESS, ROUTES } from "@/games/chess/manifest";

export const metadata: Metadata = {
  title: `Общий зал — ${CHESS.title}`,
};

/**
 * Общий зал. Комнаты у него нет — код не передаётся, и сокет уходит в зал по
 * ключу из манифеста.
 */
export default async function ChessPlayPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${ROUTES.play}`);

  // Шапку рисует сама комната: в ней живут звук, разворот доски и меню, а
  // вторая сверху выглядела бы как ошибка вёрстки.
  return (
    <GameRoom
      userId={user.id}
      nickname={user.nickname}
      avatarId={user.avatarId}
    />
  );
}

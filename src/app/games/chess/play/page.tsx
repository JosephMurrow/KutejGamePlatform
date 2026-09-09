import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { UserMenu } from "@/components/UserMenu";
import { getCurrentUser } from "@/lib/auth/session";
import { GameRoom } from "@/games/chess/components/GameRoom";
import { CHESS, ROUTES } from "@/games/chess/manifest";
import { MENU_LINKS } from "@/games/chess/menu";

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

  return (
    <div className="flex flex-1 flex-col">
      <Header
        brand={<span className="text-xl font-semibold">Шахматы</span>}
        brandHref={ROUTES.home}
      >
        <UserMenu
          nickname={user.nickname}
          avatarId={user.avatarId}
          links={MENU_LINKS}
        />
      </Header>

      <GameRoom userId={user.id} />
    </div>
  );
}

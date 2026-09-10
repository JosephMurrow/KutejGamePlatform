import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { UserMenu } from "@/components/UserMenu";
import { getCurrentUser } from "@/lib/auth/session";
import { LeaderboardTable } from "@/games/chess/components/leaderboard/Table";
import { loadBoard } from "@/games/chess/leaderboard/board";
import { CHESS, ROUTES } from "@/games/chess/manifest";
import { MENU_LINKS } from "@/games/chess/menu";

export const metadata: Metadata = {
  title: `Рейтинг — ${CHESS.title}`,
};

export default async function ChessLeaderboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${ROUTES.leaderboard}`);

  const board = await loadBoard(user.id);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
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

      <h1 className="mb-1 text-2xl font-bold">Рейтинг</h1>
      <p className="mb-5 text-sm text-muted">
        Рейтинг зала растёт только в общем зале. «Всего» — он же плюс надбавка
        за победы, в том числе в своих комнатах; повторные партии с одним и тем
        же соперником стоят дешевле. Партии с ботом не считаются вовсе.
      </p>

      <LeaderboardTable board={board} viewerId={user.id} />
    </main>
  );
}

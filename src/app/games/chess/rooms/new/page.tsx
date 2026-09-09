import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { UserMenu } from "@/components/UserMenu";
import { getCurrentUser } from "@/lib/auth/session";
import { CreateRoomForm } from "@/games/chess/components/CreateRoomForm";
import { CHESS, ROUTES } from "@/games/chess/manifest";
import { MENU_LINKS } from "@/games/chess/menu";

export const metadata: Metadata = {
  title: `Своя партия — ${CHESS.title}`,
};

export default async function ChessNewRoomPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${ROUTES.newRoom}`);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
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

      <h1 className="mb-1 text-2xl font-bold">Своя партия</h1>
      <p className="mb-6 text-sm text-muted">
        Играете вдвоём по ссылке: партия не идёт в рейтинг зала, а зрителей
        можно звать сколько угодно. После создания получишь ссылку и код.
      </p>

      <div className="rounded-2xl border border-line bg-paper p-6">
        <CreateRoomForm />
      </div>
    </main>
  );
}

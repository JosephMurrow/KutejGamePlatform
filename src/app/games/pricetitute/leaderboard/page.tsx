import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BRAND, GameBrand } from "@/games/pricetitute/components/Brand";
import { UserMenu } from "@/components/UserMenu";
import { getCurrentUser } from "@/lib/auth/session";
import { loadChampions } from "@/games/pricetitute/leaderboard/champions";
import { LeaderboardTable } from "@/games/pricetitute/components/leaderboard/LeaderboardTable";
import type { Titles } from "@/games/pricetitute/engine/crowns";
import {
  loadLeaderboard,
  type LeaderboardPeriod,
} from "@/games/pricetitute/leaderboard/board";

import { MENU_LINKS } from "@/games/pricetitute/menu";
import { Header } from "@/components/Header";
export const metadata: Metadata = {
  title: `Рейтинг — ${BRAND}`,
};

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const search = await searchParams;
  const period: LeaderboardPeriod = search.period === "week" ? "week" : "all";
  const [board, champs] = await Promise.all([
    loadLeaderboard(period, user.id),
    loadChampions(),
  ]);

  // В таблице рейтинга комнаты нет, поэтому и бронзовой короне тут взяться
  // неоткуда: только чемпион недели и чемпион за всё время.
  const titles: Titles = {
    allTimeChampionId: champs.allTime,
    weekChampionId: champs.week,
    leaders: new Set(),
  };

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Header
        brand={<GameBrand className="text-xl" />}
        brandHref="/games/pricetitute"
      >
        <UserMenu
          nickname={user.nickname}
          avatarId={user.avatarId}
          links={MENU_LINKS}
        />
      </Header>

      <h1 className="mb-1 text-2xl font-bold">Рейтинг общей комнаты</h1>
      <p className="mb-5 text-sm text-muted">
        Очки из приватных комнат сюда не идут.
        {board.since && ` Отсчёт с ${formatDate(board.since)}.`}
      </p>

      <div className="mb-5 flex gap-2">
        <Tab href="/games/pricetitute/leaderboard" active={period === "all"}>
          За всё время
        </Tab>
        <Tab href="/leaderboard?period=week" active={period === "week"}>
          За неделю
        </Tab>
      </div>

      <LeaderboardTable board={board} viewerId={user.id} titles={titles} />
    </main>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition ${
        active
          ? "border-accent bg-accent text-paper"
          : "border-line bg-paper text-muted hover:border-accent hover:text-accent"
      }`}
    >
      {children}
    </Link>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

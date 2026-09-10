import type { Metadata } from "next";
import { Brand, PLATFORM } from "@/components/Brand";
import { Header } from "@/components/Header";
import { InstallHint } from "@/components/InstallHint";
import { Shelf } from "@/components/games/Shelf";
import { ShelfBackdrop } from "@/components/games/ShelfBackdrop";
import { UserMenu } from "@/components/UserMenu";
import { getCurrentUser } from "@/lib/auth/session";
import { SignedOutLinks } from "@/components/auth/SignedOutLinks";

export const metadata: Metadata = {
  title: `Игры — ${PLATFORM}`,
};

/**
 * Витрина. Открыта и незалогиненному: полка — лицо платформы, и посторонний
 * должен увидеть, во что тут играют, до всякой регистрации. Войти просят на
 * пороге игры, а не на пороге полки (docs/BACKLOG.md C1).
 *
 * Гостя сюда не пускает proxy: он заведён под одну комнату и исчезает вместе
 * с ней.
 */
export default async function GamesPage() {
  const user = await getCurrentUser();

  return (
    <>
      <ShelfBackdrop />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        <Header brand={<Brand className="h-8" />} brandHref="/games">
          {user ? (
            <UserMenu nickname={user.nickname} avatarId={user.avatarId} />
          ) : (
            <SignedOutLinks />
          )}
        </Header>

        <InstallHint />
        <Shelf />
      </main>
    </>
  );
}

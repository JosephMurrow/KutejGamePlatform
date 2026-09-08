import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BRAND, Brand } from "@/components/Brand";
import { CreateRoomForm } from "@/games/pricetitute/components/CreateRoomForm";
import { UserMenu } from "@/components/UserMenu";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: `Своя комната — ${BRAND}`,
};

export default async function NewRoomPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/games/pricetitute/rooms/new");
  }

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <Link href="/">
          <Brand className="text-xl" />
        </Link>
        <UserMenu nickname={user.nickname} avatarId={user.avatarId} />
      </header>

      <h1 className="mb-1 text-2xl font-bold">Своя комната</h1>
      <p className="mb-6 text-sm text-muted">
        Играете своей компанией: счёт остаётся внутри комнаты и в общий рейтинг
        не идёт. После создания получишь ссылку-приглашение.
      </p>

      <div className="rounded-2xl border border-line bg-paper p-6">
        <CreateRoomForm />
      </div>
    </main>
  );
}

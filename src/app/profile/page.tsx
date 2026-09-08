import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Brand, PLATFORM } from "@/components/Brand";
import { EmailForm } from "@/components/profile/EmailForm";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { UserMenu } from "@/components/UserMenu";
import { getCurrentUser } from "@/lib/auth/session";

import { Header } from "@/components/Header";
import { Card } from "@/components/ui/Card";
export const metadata: Metadata = {
  title: `Профиль — ${PLATFORM}`,
};

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Header brand={<Brand className="text-xl" />} brandHref="/games">
        <UserMenu nickname={user.nickname} avatarId={user.avatarId} />
      </Header>

      <Card className="mb-6 flex items-center gap-4">
        <Avatar id={user.avatarId} size={64} />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{user.nickname}</p>
          <p className="truncate text-sm text-muted">@{user.login}</p>
        </div>
      </Card>

      <Card>
        <h1 className="mb-5 text-lg font-semibold">Профиль</h1>
        <ProfileForm nickname={user.nickname} avatarId={user.avatarId} />
      </Card>

      <Card className="mt-6">
        <h2 className="mb-5 text-lg font-semibold">Почта</h2>
        <EmailForm
          email={user.email}
          confirmed={user.emailConfirmedAt !== null}
        />
      </Card>
    </main>
  );
}

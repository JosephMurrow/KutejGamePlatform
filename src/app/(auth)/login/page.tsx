import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { Brand, PLATFORM } from "@/components/Brand";

export const metadata: Metadata = {
  title: `Вход — ${PLATFORM}`,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center">
          <Brand className="text-2xl" />
        </Link>

        <div className="rounded-2xl border border-line bg-paper p-6">
          <h1 className="mb-5 text-xl font-semibold">Вход</h1>
          <LoginForm next={next} />
        </div>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { Brand, PLATFORM } from "@/components/Brand";

import { Card } from "@/components/ui/Card";
export const metadata: Metadata = {
  title: `Регистрация — ${PLATFORM}`,
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center">
          <Brand className="h-10" />
        </Link>

        <Card>
          <h1 className="mb-5 text-xl font-semibold">Регистрация</h1>
          <RegisterForm next={next} />
        </Card>
      </div>
    </main>
  );
}

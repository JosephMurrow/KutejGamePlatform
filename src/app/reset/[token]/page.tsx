import type { Metadata } from "next";
import { Brand, PLATFORM } from "@/components/Brand";
import { ResetForm } from "@/components/auth/ResetForm";

export const metadata: Metadata = {
  title: `Новый пароль — ${PLATFORM}`,
};

/**
 * Экран нового пароля. Ссылку здесь не гасим и даже не проверяем: погасить её
 * должен тот, кто пароль меняет, а не тот, кто просто открыл страницу — иначе
 * предпросмотр ссылки в мессенджере сжигал бы её до человека.
 */
export default async function ResetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <div className="mb-6 text-center">
        <Brand className="text-2xl" />
      </div>

      <h1 className="mb-1 text-2xl font-bold">Новый пароль</h1>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        Придумай пароль и запиши его. После смены все открытые сессии этого
        аккаунта закроются — на всех устройствах.
      </p>

      <ResetForm token={token} />
    </main>
  );
}

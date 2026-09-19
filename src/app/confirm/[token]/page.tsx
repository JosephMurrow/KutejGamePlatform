import type { Metadata } from "next";
import { Brand, PLATFORM } from "@/components/Brand";
import { ConfirmForm } from "@/components/auth/ConfirmForm";

export const metadata: Metadata = {
  title: `Подтверждение адреса — ${PLATFORM}`,
};

/**
 * Переход по ссылке из письма. Ссылку здесь не гасим и даже не проверяем:
 * погасить её должен человек нажатием, а не тот, кто просто открыл страницу, —
 * иначе предпросмотр в мессенджере и почтовый сканер сжигали бы её до
 * человека (docs/SECURITY.md, S-B6). Так же устроен сброс пароля.
 */
export default async function ConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <Brand className="h-10" />
      <ConfirmForm token={token} />
    </main>
  );
}

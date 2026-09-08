import type { Metadata } from "next";
import Link from "next/link";
import { BRAND, Brand } from "@/components/Brand";
import { claimLink } from "@/lib/auth/links";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: `Подтверждение адреса — ${BRAND}`,
};

/**
 * Переход по ссылке из письма. Страница серверная и гасит ссылку сразу: так
 * повторный переход уже ничего не подтвердит.
 */
export default async function ConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const claimed = await claimLink(token, "EMAIL_CONFIRM");

  if (claimed) {
    // Подтверждаем тот адрес, на который ушло письмо: человек мог успеть
    // поменять почту в профиле, пока письмо шло.
    await prisma.user.updateMany({
      where: { id: claimed.userId, email: claimed.email },
      data: { emailConfirmedAt: new Date() },
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <Brand className="text-2xl" />

      <div>
        <h1 className="text-xl font-semibold">
          {claimed ? "Адрес подтверждён" : "Ссылка не сработала"}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-balance text-sm leading-relaxed text-muted">
          {claimed
            ? "Теперь забытый пароль можно восстановить по почте."
            : "Ссылка живёт час и срабатывает один раз. Запроси новую в профиле."}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href="/games/pricetitute/play"
          className="rounded-lg bg-crimson px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-deep"
        >
          В общую комнату
        </Link>
        <Link
          href="/profile"
          className="rounded-lg border border-line bg-paper px-5 py-2.5 text-sm font-semibold transition hover:border-crimson hover:text-crimson"
        >
          В профиль
        </Link>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Brand, PLATFORM } from "@/components/Brand";
import { JoinByCodeForm } from "@/components/rooms/JoinByCodeForm";

import { Card } from "@/components/ui/Card";
export const metadata: Metadata = {
  title: `Вход по коду — ${PLATFORM}`,
};

/**
 * Вход в комнату по коду.
 *
 * Нужен там, где ссылку не кликнешь: код показывают на телевизоре или в
 * трансляции, и набрать шесть символов — единственный способ попасть внутрь.
 * Алфавит кода к этому готов заранее: в нём нет нуля, единицы и похожих букв,
 * потому что код ещё и диктуют голосом.
 */
export default function JoinPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <Link href="/">
          <Brand className="text-3xl" />
        </Link>
        <h1 className="mt-4 text-2xl font-bold">Код комнаты</h1>
        <p className="mt-1 text-sm text-muted">
          Шесть символов с экрана или из чата.
        </p>
      </div>

      <Card>
        <JoinByCodeForm />
      </Card>
    </main>
  );
}

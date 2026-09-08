import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <Brand className="h-10" />

      <div>
        <h1 className="text-xl font-semibold">Страница не найдена</h1>
        <p className="mt-2 max-w-sm text-balance text-sm text-muted">
          Ссылка ведёт в пустоту. Бывает.
        </p>
      </div>

      <Link
        href="/"
        className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-deep"
      >
        На главную
      </Link>
    </main>
  );
}

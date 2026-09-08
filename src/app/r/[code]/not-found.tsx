import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function RoomNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <Brand className="text-2xl" />

      <div>
        <h1 className="text-xl font-semibold">Такой комнаты нет</h1>
        <p className="mt-2 max-w-sm text-balance text-sm text-muted">
          Ссылка устарела или комнату уже закрыли: пустая комната живёт полчаса
          после ухода последнего игрока.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href="/games/pricetitute/rooms/new"
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-deep"
        >
          Создать свою
        </Link>
        <Link
          href="/games/pricetitute/play"
          className="rounded-lg border border-line bg-paper px-5 py-2.5 text-sm font-semibold transition hover:border-accent hover:text-accent"
        >
          В общую комнату
        </Link>
      </div>
    </main>
  );
}

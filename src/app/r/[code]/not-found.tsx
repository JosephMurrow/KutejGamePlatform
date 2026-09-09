import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function RoomNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <Brand className="h-10" />

      <div>
        <h1 className="text-xl font-semibold">Такой комнаты нет</h1>
        <p className="mt-2 max-w-sm text-balance text-sm text-muted">
          Ссылка устарела или комнату уже закрыли: пустая комната живёт полчаса
          после ухода последнего игрока.
        </p>
      </div>

      {/*
        Кнопка одна и ведёт на витрину: куда именно звать — в общий зал или
        заводить свою комнату — знает игра, а страница «комнаты нет» не знает,
        какая это была игра (src/games/chess/docs/BACKLOG.md A4).
      */}
      <Link
        href="/games"
        className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-deep"
      >
        К играм
      </Link>
    </main>
  );
}

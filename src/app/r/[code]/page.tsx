import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { PLATFORM } from "@/components/Brand";
import { GuestGate } from "@/components/rooms/GuestGate";
import { GameTheme } from "@/components/games/GameTheme";
import { gameById } from "@/lib/games/registry";
import { gamePages } from "@/lib/games/pages";
import { getCurrentUser } from "@/lib/auth/session";
import { findPrivateRoom } from "@/lib/rooms/private";
import { allowsGuests } from "@/shared/room-settings";

/**
 * Комната нужна дважды за запрос — заголовку вкладки и самой странице. `cache`
 * склеивает два обращения в базу в одно.
 */
const roomByCode = cache(findPrivateRoom);

/** Вкладка подписана игрой, а не платформой: комнаты у игр разные (E1). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const room = await roomByCode(code);
  const game = room ? gameById(room.gameId) : null;

  return { title: `Своя комната — ${game?.title ?? PLATFORM}` };
}

export default async function PrivateRoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const room = await roomByCode(code);
  if (!room) {
    notFound();
  }

  const user = await getCurrentUser();

  if (!user) {
    // В стримерскую пускают гостем: зритель не пойдёт регистрироваться ради
    // одного раунда. В остальные — только по аккаунту, как и было.
    if (allowsGuests(room.kind)) {
      return <GuestGate code={room.code} title={room.title} />;
    }

    redirect(`/login?next=${encodeURIComponent(`/r/${code}`)}`);
  }

  // Гость чужой комнаты: своя у него одна, и это не она.
  if (user.isGuest && user.guestRoomId !== room.id) {
    notFound();
  }

  // Что рисовать внутри — дело игры, записанной в комнате. Платформа знает
  // только про порог для гостя и про тему (docs/BACKLOG.md E1).
  const pages = gamePages(room.gameId);
  if (!pages) {
    notFound();
  }

  // Комната красится темой той игры, что в ней записана. Выход на витрину
  // гостю не показываем: она для него закрыта, а уход из комнаты его стирает.
  return (
    <GameTheme id={room.gameId} exit={!user.isGuest}>
      <pages.Room room={room} user={user} />
    </GameTheme>
  );
}

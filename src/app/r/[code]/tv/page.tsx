import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PLATFORM } from "@/components/Brand";
import { GameTheme } from "@/components/games/GameTheme";
import { gameById } from "@/lib/games/registry";
import { gamePages } from "@/lib/games/pages";
import { getSessionUserId } from "@/lib/auth/session";
import { findPrivateRoom } from "@/lib/rooms/private";
import { hasScreen } from "@/shared/room-settings";

const roomByCode = cache(findPrivateRoom);

/** Экран тоже подписан игрой: на телевизоре открыта не «платформа». */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const room = await roomByCode(code);
  const game = room ? gameById(room.gameId) : null;

  return { title: `Экран — ${game?.title ?? PLATFORM}` };
}

/**
 * Вид «экран»: то, что уходит на телевизор или в трансляцию.
 *
 * Пускают сюда по ключу комнаты, а не по сессии: браузерный источник OBS ходит
 * со своей пустой банкой кук, нашей сессии у него нет. Хозяину ключ не нужен —
 * он и так свой, и открыть экран своей комнаты может по короткому адресу.
 *
 * Утечка ключа не страшна ровно потому, что на экране нет секретов: посторонний
 * сможет смотреть партию, и только.
 */
export default async function ScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { code } = await params;
  const { key } = await searchParams;

  const room = await roomByCode(code);
  if (!room || !hasScreen(room.kind)) {
    notFound();
  }

  if (key !== room.screenKey) {
    const userId = await getSessionUserId();
    if (userId !== room.hostId) notFound();
  }

  const pages = gamePages(room.gameId);
  if (!pages) {
    notFound();
  }

  // Выхода на витрину здесь нет: на экран смотрят, по нему не кликают, а в
  // кадре трансляции кнопка была бы мусором.
  return (
    <GameTheme id={room.gameId} exit={false}>
      <pages.Screen room={room} />
    </GameTheme>
  );
}

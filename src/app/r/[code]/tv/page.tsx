import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BRAND } from "@/components/Brand";
import { ScreenView } from "@/games/pricetitute/components/ScreenView";
import { getSessionUserId } from "@/lib/auth/session";
import { findPrivateRoom } from "@/lib/rooms/private";
import { hasScreen } from "@/shared/room-settings";

export const metadata: Metadata = {
  title: `Экран — ${BRAND}`,
};

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

  const room = await findPrivateRoom(code);
  if (!room || !hasScreen(room.kind)) {
    notFound();
  }

  if (key !== room.screenKey) {
    const userId = await getSessionUserId();
    if (userId !== room.hostId) notFound();
  }

  return <ScreenView roomCode={room.code} screenKey={room.screenKey} />;
}

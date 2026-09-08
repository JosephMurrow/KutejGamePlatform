import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PLATFORM } from "@/components/Brand";
import { GameRoom } from "@/games/pricetitute/components/GameRoom";
import { GuestGate } from "@/components/rooms/GuestGate";
import { HardcoreGate } from "@/games/pricetitute/components/HardcoreGate";
import { getCurrentUser } from "@/lib/auth/session";
import { GameTheme } from "@/components/games/GameTheme";
import { loadRoomSettings } from "@/games/pricetitute/rooms/store";
import { isHardcore } from "@/games/pricetitute/questions/modes";
import { findPrivateRoom } from "@/lib/rooms/private";
import { allowsGuests } from "@/shared/room-settings";

export const metadata: Metadata = {
  title: `Своя комната — ${PLATFORM}`,
};

export default async function PrivateRoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const room = await findPrivateRoom(code);
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

  const game = (
    <GameRoom
      nickname={user.nickname}
      avatarId={user.avatarId}
      roomCode={room.code}
      isGuest={user.isGuest}
      // Ключ экрана — хозяину и только ему: остальным он ни к чему, а лишний
      // раз раздавать пропуск незачем.
      screenKey={user.id === room.hostId ? room.screenKey : undefined}
    />
  );

  // В комнату с чернотой человек попадает только через предупреждение.
  const body = isHardcore((await loadRoomSettings(room.id, room.kind)).mode) ? (
    <HardcoreGate code={room.code}>{game}</HardcoreGate>
  ) : (
    game
  );

  // Комната красится темой той игры, что в ней записана.
  return <GameTheme id={room.gameId}>{body}</GameTheme>;
}

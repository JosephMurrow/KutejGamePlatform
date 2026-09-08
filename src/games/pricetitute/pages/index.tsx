import type {
  GamePages,
  GameRoomViewProps,
  GameScreenViewProps,
} from "@/lib/games/pages";
import { GameRoom } from "@/games/pricetitute/components/GameRoom";
import { HardcoreGate } from "@/games/pricetitute/components/HardcoreGate";
import { ScreenView } from "@/games/pricetitute/components/ScreenView";
import { isHardcore } from "@/games/pricetitute/questions/modes";
import { loadRoomSettings } from "@/games/pricetitute/rooms/store";

/**
 * Что платитутка рисует в комнате и на экране. Платформа зовёт это через
 * страничный реестр и внутрь не смотрит (docs/BACKLOG.md E1).
 */

async function Room({ room, user }: GameRoomViewProps) {
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

  // В комнату с чернотой человек попадает только через предупреждение. Порог
  // игровой, поэтому и стоит он здесь, а не на платформенной странице.
  const { mode } = await loadRoomSettings(room.id, room.kind);

  return isHardcore(mode) ? (
    <HardcoreGate code={room.code}>{game}</HardcoreGate>
  ) : (
    game
  );
}

function Screen({ room }: GameScreenViewProps) {
  return <ScreenView roomCode={room.code} screenKey={room.screenKey} />;
}

export const PRICETITUTE_PAGES: GamePages = { Room, Screen };

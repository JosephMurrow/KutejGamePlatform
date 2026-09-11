import type {
  GamePages,
  GameRoomViewProps,
  GameScreenViewProps,
} from "@/lib/games/pages";
import { GameRoom } from "../components/GameRoom";
import { ScreenView } from "../components/ScreenView";

/**
 * Что турбо-шахматы рисуют в комнате и на экране. Платформа зовёт это через
 * страничный реестр и внутрь не смотрит (docs/BACKLOG.md E1).
 *
 * Обе страницы — тонкие обёртки: всё состояние приходит снимком по сокету, и
 * серверу тут считать нечего. Так же устроены страницы шахмат.
 */

function Room({ room, user }: GameRoomViewProps) {
  return (
    <GameRoom
      roomCode={room.code}
      userId={user.id}
      nickname={user.nickname}
      avatarId={user.avatarId}
    />
  );
}

function Screen({ room }: GameScreenViewProps) {
  return <ScreenView roomCode={room.code} screenKey={room.screenKey} />;
}

export const TURBOCHESS_PAGES: GamePages = { Room, Screen };

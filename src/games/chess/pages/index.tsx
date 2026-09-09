import type {
  GamePages,
  GameRoomViewProps,
  GameScreenViewProps,
} from "@/lib/games/pages";
import { GameRoom } from "@/games/chess/components/GameRoom";
import { ScreenView } from "@/games/chess/components/ScreenView";

/**
 * Что шахматы рисуют в комнате и на экране. Платформа зовёт это через
 * страничный реестр и внутрь не смотрит (docs/BACKLOG.md E1).
 *
 * Обе страницы — тонкие обёртки: всё состояние приходит снимком по сокету, и
 * серверу тут считать нечего.
 */

function Room({ room, user }: GameRoomViewProps) {
  return <GameRoom roomCode={room.code} userId={user.id} />;
}

function Screen({ room }: GameScreenViewProps) {
  return <ScreenView roomCode={room.code} screenKey={room.screenKey} />;
}

export const CHESS_PAGES: GamePages = { Room, Screen };

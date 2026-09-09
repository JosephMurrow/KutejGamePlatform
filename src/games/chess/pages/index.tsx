import type {
  GamePages,
  GameRoomViewProps,
  GameScreenViewProps,
} from "@/lib/games/pages";
import { loadRoomSettings } from "@/games/chess/rooms/store";
import { WaitingRoom } from "@/games/chess/components/WaitingRoom";

/**
 * Что шахматы рисуют в комнате и на экране. Платформа зовёт это через
 * страничный реестр и внутрь не смотрит (docs/BACKLOG.md E1).
 *
 * Пока обе страницы показывают, что комната поднялась и чем она играет:
 * доска и ходы приходят вместе с правилами и клиентом
 * (src/games/chess/docs/PLAN.md, этапы 2–4).
 */

async function Room({ room }: GameRoomViewProps) {
  const settings = await loadRoomSettings(room.id);

  return <WaitingRoom code={room.code} timeControl={settings.timeControl} />;
}

async function Screen({ room }: GameScreenViewProps) {
  const settings = await loadRoomSettings(room.id);

  return (
    <WaitingRoom code={room.code} timeControl={settings.timeControl} screen />
  );
}

export const CHESS_PAGES: GamePages = { Room, Screen };

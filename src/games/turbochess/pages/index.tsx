import type {
  GamePages,
  GameRoomViewProps,
  GameScreenViewProps,
} from "@/lib/games/pages";
import { WaitingRoom } from "../components/WaitingRoom";
import { loadRoomSettings } from "../rooms/store";

/**
 * Что турбо-шахматы рисуют в комнате и на экране. Платформа зовёт это через
 * страничный реестр и внутрь не смотрит (docs/BACKLOG.md E1).
 *
 * Пока обе страницы показывают, что комната поднялась и в каком она режиме:
 * доска и ходы приходят вместе с движком и сетевой партией (docs/PLAN.md,
 * этапы 3–5).
 */

async function Room({ room }: GameRoomViewProps) {
  const settings = await loadRoomSettings(room.id);

  return <WaitingRoom code={room.code} mode={settings.mode} />;
}

async function Screen({ room }: GameScreenViewProps) {
  const settings = await loadRoomSettings(room.id);

  return <WaitingRoom code={room.code} mode={settings.mode} screen />;
}

export const TURBOCHESS_PAGES: GamePages = { Room, Screen };

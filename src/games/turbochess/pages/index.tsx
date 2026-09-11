import type {
  GamePages,
  GameRoomViewProps,
  GameScreenViewProps,
} from "@/lib/games/pages";
import { LocalTable } from "../components/LocalTable";
import { WaitingRoom } from "../components/WaitingRoom";
import { loadRoomSettings } from "../rooms/store";

/**
 * Что турбо-шахматы рисуют в комнате и на экране. Платформа зовёт это через
 * страничный реестр и внутрь не смотрит (docs/BACKLOG.md E1).
 *
 * В комнате пока доска за одним экраном — партия по сети придёт на этапе 5
 * (docs/PLAN.md). Экрану трансляции доска без сети ни к чему: он показывает,
 * что комната поднялась и в каком она режиме.
 */

async function Room({ room }: GameRoomViewProps) {
  const settings = await loadRoomSettings(room.id);

  return <LocalTable code={room.code} mode={settings.mode} />;
}

async function Screen({ room }: GameScreenViewProps) {
  const settings = await loadRoomSettings(room.id);

  return <WaitingRoom code={room.code} mode={settings.mode} screen />;
}

export const TURBOCHESS_PAGES: GamePages = { Room, Screen };

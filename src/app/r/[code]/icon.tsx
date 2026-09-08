import {
  ICON_SIZE,
  ICON_TYPE,
  iconResponse,
  PLATFORM_ICON,
} from "@/lib/games/icon";
import { gameById } from "@/lib/games/registry";
import { findPrivateRoom } from "@/lib/rooms/private";

export const size = ICON_SIZE;
export const contentType = ICON_TYPE;

/**
 * Комната берёт знак у той игры, что в ней записана: в дерево игры этот адрес
 * не входит, а игру знает только база (docs/BACKLOG.md D7).
 *
 * Комнаты нет или игра незнакомая — остаётся знак платформы: вкладка без
 * иконки выглядит поломкой, а не пустотой.
 */
export default async function Icon({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const room = await findPrivateRoom(code);
  const game = room ? gameById(room.gameId) : null;

  return iconResponse(game?.icon ?? PLATFORM_ICON);
}

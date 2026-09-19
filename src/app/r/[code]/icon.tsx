import {
  ICON_SIZE,
  ICON_TYPE,
  iconResponse,
  PLATFORM_ICON,
} from "@/lib/games/icon";
import { gameById } from "@/lib/games/registry";
import { findRoomByCode } from "@/lib/rooms/code-guard";
import { requestAddress } from "@/lib/request-address";

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
  // Иконка тоже выдаёт, есть ли комната, — поэтому и здесь промахи на счету
  // (docs/SECURITY.md, S-D1).
  const { room } = await findRoomByCode(code, await requestAddress());
  const game = room ? gameById(room.gameId) : null;

  return iconResponse(game?.icon ?? PLATFORM_ICON);
}

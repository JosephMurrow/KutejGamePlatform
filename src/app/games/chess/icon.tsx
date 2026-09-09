import { ICON_SIZE, ICON_TYPE, iconResponse } from "@/lib/games/icon";
import { CHESS } from "@/games/chess/manifest";

export const size = ICON_SIZE;
export const contentType = ICON_TYPE;

/** На страницах игры вкладка подписана её знаком, а не платформенным. */
export default function Icon() {
  return iconResponse(CHESS.icon);
}

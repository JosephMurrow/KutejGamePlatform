import { ICON_SIZE, ICON_TYPE, iconResponse } from "@/lib/games/icon";
import { PRICETITUTE } from "@/games/pricetitute/manifest";

export const size = ICON_SIZE;
export const contentType = ICON_TYPE;

/** На страницах игры вкладка подписана её знаком, а не платформенным. */
export default function Icon() {
  return iconResponse(PRICETITUTE.icon);
}

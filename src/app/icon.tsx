import {
  ICON_SIZE,
  ICON_TYPE,
  iconResponse,
  PLATFORM_ICON,
} from "@/lib/games/icon";

export const size = ICON_SIZE;
export const contentType = ICON_TYPE;

/** Знак «Кутежа»: он стоит везде, кроме страниц игр и их комнат. */
export default function Icon() {
  return iconResponse(PLATFORM_ICON);
}

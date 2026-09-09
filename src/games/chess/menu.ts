import type { MenuLink } from "@/components/UserMenu";
import { ROUTES } from "./manifest";

/**
 * Пункты шахмат в меню под аватаром. Платформа добавит к ним свои — профиль,
 * вход по коду и выход на витрину.
 */
export const MENU_LINKS: readonly MenuLink[] = [
  { href: ROUTES.play, label: "В общий зал" },
  { href: ROUTES.newRoom, label: "Своя партия" },
  // Рейтинг открывается окном: переход по ссылке рвёт сокет, а вместе с ним и
  // идущую партию (docs/HISTORY.md).
  { href: ROUTES.leaderboard, label: "Рейтинг", overlay: true },
];

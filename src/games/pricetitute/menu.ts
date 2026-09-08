import type { MenuLink } from "@/components/UserMenu";
import { ROUTES } from "./manifest";

/**
 * Пункты платитутки в меню под аватаром. Платформа добавит к ним свои —
 * профиль, вход по коду и выход на витрину.
 */
export const MENU_LINKS: readonly MenuLink[] = [
  { href: ROUTES.play, label: "В общую комнату" },
  { href: ROUTES.newRoom, label: "Своя комната" },
  // В комнате рейтинг открывается окном: переход по ссылке рвёт сокет и через
  // пятнадцать секунд высаживает из-за стола.
  { href: ROUTES.leaderboard, label: "Рейтинг", overlay: true },
];

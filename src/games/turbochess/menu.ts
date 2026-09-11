import type { MenuLink } from "@/components/UserMenu";
import { ROUTES } from "./manifest";

/**
 * Пункты турбо-шахмат в меню под аватаром. Платформа добавит к ним свои —
 * профиль, вход по коду и выход на витрину.
 *
 * Пункт один: общего зала у игры нет, таблицы пока тоже (docs/BACKLOG.md C1,
 * G3).
 */
export const MENU_LINKS: readonly MenuLink[] = [
  { href: ROUTES.newRoom, label: "Своя партия" },
];

import type { ComponentType } from "react";
import type { CurrentUser } from "@/lib/auth/session";
import type { PrivateRoomInfo } from "@/lib/rooms/private";
import { PRICETITUTE_PAGES } from "@/games/pricetitute/pages";
import { CHESS_PAGES } from "@/games/chess/pages";

/**
 * Страничный реестр: что игра рисует в комнате и на экране.
 *
 * Четвёртый и последний реестр — и он же исключение из правила импортов, как
 * и три остальных (docs/BACKLOG.md A6, E1).
 *
 * Зачем отдельно от клиентского манифеста: страницы игры — серверные
 * компоненты, они читают базу. Положи их в `manifest.ts` — и весь Prisma
 * уедет в браузер вместе с аватарами; на этом уже обжигались (docs/PLAN.md,
 * этап 5).
 *
 * Зачем вообще: комната `/r/<code>` не лежит в дереве игры и узнаёт игру
 * только из базы. Без реестра она импортировала игру поимённо — и держала
 * `src/app/**` вне правила импортов.
 *
 * Серверный модуль. Из клиентского компонента не импортировать.
 */

export interface GameRoomViewProps {
  room: PrivateRoomInfo;
  user: CurrentUser;
}

export interface GameScreenViewProps {
  room: PrivateRoomInfo;
}

export interface GamePages {
  /** Комната: всё, что видит игрок за столом, вместе с игровыми порогами. */
  Room: ComponentType<GameRoomViewProps>;
  /** Экран для телевизора и трансляции. */
  Screen: ComponentType<GameScreenViewProps>;
}

const PAGES: Readonly<Record<string, GamePages>> = {
  pricetitute: PRICETITUTE_PAGES,
  chess: CHESS_PAGES,
};

/** Страницы игры по её коду. `null` — игра из базы платформе незнакома. */
export function gamePages(gameId: string): GamePages | null {
  return PAGES[gameId] ?? null;
}

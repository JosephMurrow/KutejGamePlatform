import type { PlayerPayload, RoomStatePayload } from "@/shared/protocol";
import type { TurboMode } from "./modes/catalog";

/**
 * Протокол турбо-шахмат: код игры, ключ зала, события сокета и форма снимка.
 *
 * Снимок игры **расширяет** платформенный тип, а не заворачивается в него: на
 * проводе он остаётся плоским (src/shared/protocol.ts).
 */

/** Код игры: им она зовётся в адресах, в базе и в реестрах. */
export const GAME_ID = "turbochess";

/**
 * Ключ общего зала.
 *
 * Общего зала у турбо-шахмат нет — играют только в своей комнате
 * (docs/BACKLOG.md C1). Но договор платформы требует ключ у каждой игры:
 * подключение без кода комнаты она ведёт в общий зал. Под этим ключом
 * поднимается закрытая дверь — никого не сажает и все действия отбивает
 * (server/hall.ts). Не `"global"` и не `"chess-lobby"`: они заняты.
 */
export const GLOBAL_ROOM = "turbochess-hall";

/**
 * События, которые игра слушает в сокете. Платформа регистрирует ровно то, что
 * здесь перечислено. Пока пусто: ходить нечем, партия появится на этапе 5
 * (docs/PLAN.md).
 */
export const GAME_EVENT = {} as const satisfies Record<string, string>;

/** Где стол: ждёт игроков, все расселись — или это закрытая дверь зала. */
export type TurboPhase = "waiting" | "ready" | "closed";

export interface TurboPlayerPayload extends PlayerPayload {
  /** Место за столом, с нуля. Мест два, в королевской битве — четыре. */
  seat: number;
}

export interface TurboStatePayload extends RoomStatePayload<TurboPlayerPayload> {
  phase: TurboPhase;
  /** Режим партии; у закрытой двери — null. */
  mode: TurboMode | null;
  /** Сколько мест за столом в этом режиме. */
  seats: number;
}

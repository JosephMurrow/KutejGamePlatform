import type { PlayerPayload, RoomStatePayload } from "@/shared/protocol";

/**
 * Протокол шахмат: всё, что платформа про игру знать не обязана — сторона,
 * позиция, ход, исход партии.
 *
 * Типы расширяют платформенные, а не заворачиваются в них: снимок на проводе
 * остаётся плоским (docs/BACKLOG.md A3).
 */

/** Код игры: им она зовётся в адресах, в базе и в реестрах. */
export const GAME_ID = "chess";

/**
 * Ключ общего зала. Собственный, а не «global» — тот навсегда закреплён за
 * платитуткой, за ним её живые раунды и очки (docs/README.md).
 */
export const GLOBAL_ROOM = "chess-lobby";

/**
 * Действия, которые понимает движок шахмат.
 *
 * Пока их два: остальное — предложение ничьей, реванш, премув — появится
 * вместе с правилами и доской (src/games/chess/docs/PLAN.md, этапы 2–5).
 * Заводить имена под нереализованное незачем: платформа регистрирует их в
 * сокете как есть, и мёртвое действие выглядело бы рабочим.
 */
export const GAME_EVENT = {
  /** Ход: координаты и фигура превращения. Запись партии считает сервер. */
  move: "game:move",
  /** Сдача. */
  resign: "game:resign",
} as const;

/** Цвет за доской. У зрителя цвета нет. */
export type ChessColor = "white" | "black";

/** Что сейчас происходит в комнате. */
export type ChessPhase =
  /** Ждём второго: за доской меньше двоих. */
  | "waiting"
  /** Партия идёт. */
  | "playing"
  /** Партия кончилась — на доске финальная позиция. */
  | "over";

export interface ChessPlayerPayload extends PlayerPayload {
  /** За какой цвет играет. */
  color: ChessColor;
}

export interface ChessStatePayload extends RoomStatePayload<ChessPlayerPayload> {
  phase: ChessPhase;
  /**
   * Позиция в нотации Форсайта — Эдвардса; null, пока партия не началась.
   * Клиент никогда не присылает позицию обратно, только ход
   * (src/games/chess/docs/BACKLOG.md B1).
   */
  fen: string | null;
  /** Чей ход. Вне партии — null. */
  turn: ChessColor | null;
}

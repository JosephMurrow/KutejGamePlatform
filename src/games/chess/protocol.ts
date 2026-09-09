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
 * Предложение ничьей сопернику и реванш появятся со своими экранами; премув —
 * в этапе 12 (src/games/chess/docs/PLAN.md). Заводить имена под нереализованное
 * незачем: платформа регистрирует их в сокете как есть, и мёртвое действие
 * выглядело бы рабочим.
 */
export const GAME_EVENT = {
  /** Ход: координаты и фигура превращения. Запись партии считает сервер. */
  move: "game:move",
  /** Сдача. */
  resign: "game:resign",
  /**
   * Требование ничьей: по троекратному повторению или пятидесяти ходам. По
   * правилам это право игрока, а не автоматический конец партии
   * (src/games/chess/docs/SPEC.md).
   */
  claimDraw: "game:draw",
  /** Ещё партия в той же комнате — цвета меняются местами. */
  rematch: "game:rematch",
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
  /** Ушёл, и его ждут: соперник должен это видеть. */
  away: boolean;
  /** Рейтинг рядом с ником. Настоящий счёт придёт своим этапом. */
  rating: number;
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
  /** Записи ходов по порядку: из них собирается список партии. */
  moves: string[];
  /** Откуда и куда пошли последний раз: доска это подсвечивает. */
  lastMove: { from: string; to: string } | null;
  /** Есть ли прямо сейчас основание требовать ничью. */
  claimable: "threefold" | "fiftyMoves" | null;
  /** Кто выиграл. Заполнено только после конца партии. */
  result: "white" | "black" | "draw" | null;
  /** Почему партия кончилась. */
  reason: string | null;
  /** Сколько даётся на ход, как это записано в настройках комнаты. */
  timeControl: string;
  /**
   * Режим стримера: подсказки гасит клиент. Прятать на сервере тут нечего —
   * позиция и так видна обоим (src/games/chess/docs/BACKLOG.md F1).
   */
  streamerMode: boolean;
}

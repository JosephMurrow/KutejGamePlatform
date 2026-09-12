import type { PlayerPayload, RoomStatePayload } from "@/shared/protocol";
import type { Result, EndReason } from "./engine/outcome";
import type { Side } from "./engine/pieces";
import type { Position } from "./engine/position";
import type { TurboMode } from "./modes/catalog";
import type { ModeOptions, TimeControl } from "./rooms/settings";

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
 * здесь перечислено. Имена те же, что у шахмат: сокет принадлежит одной
 * комнате одной игры, и путаницы между играми быть не может.
 */
export const GAME_EVENT = {
  /** `{ from, to, promotion?, ply }` */
  move: "game:move",
  resign: "game:resign",
  /** Требовать ничью по повторению или пятидесяти ходам. */
  claimDraw: "game:draw",
  /** Предложить ничью — или принять чужое предложение: у человека кнопка одна. */
  offerDraw: "game:offer",
  declineDraw: "game:decline",
  /** Ещё партия в той же комнате: места меняются. */
  rematch: "game:rematch",
  /**
   * «Вскрываемся»: поменять две свои фигуры местами, пока идёт расстановка.
   * `{ from, to }` — клетки своей зоны.
   */
  swap: "game:swap",
  /** «Вскрываемся»: расстановка готова. Оба готовы — вскрываемся досрочно. */
  ready: "game:ready",
  /**
   * «Ядерные»: сбросить бомбу. Только в свой ход и вместо хода — набранный
   * заряд проверяет комната (docs/MODES.md, режим 8).
   */
  bomb: "game:bomb",
  /** «Последний шанс»: прыгнуть королём в случайную клетку вместо хода. */
  chance: "game:chance",
  /** «Анархия»: отменить последний ход соперника. */
  veto: "game:veto",
  /** «Алко»: подтвердить, что соперник выпил. */
  toast: "game:toast",
  /** «Чёрный рынок»: купить эффект. `{ item, from?, to?, kind? }` */
  buy: "game:buy",
} as const;

/** Где стол: ждёт игроков, партия идёт, кончилась — или это закрытая дверь зала. */
export type TurboPhase =
  | "waiting"
  /** «Вскрываемся»: оба расставляют фигуры вслепую. */
  | "setup"
  | "playing"
  | "over"
  | "closed";

export interface TurboPlayerPayload extends PlayerPayload {
  /** Место за столом, с нуля. У двоих это и сторона: белые — 0, чёрные — 1. */
  seat: number;
  /** Ушёл, и его ждут: соперник должен это видеть. */
  away: boolean;
}

export interface TurboStatePayload extends RoomStatePayload<TurboPlayerPayload> {
  phase: TurboPhase;
  /** Режим партии; у закрытой двери — null. */
  mode: TurboMode | null;
  /** Ручки режима: вид фигур у одновидовых и так далее. */
  options: ModeOptions | null;
  /** Сколько мест за столом. */
  seats: number;
  /**
   * Позиция — объектом, как её понимает движок. Клиент гоняет по ней тот же
   * движок: подсказать ходы и показать ход до ответа сервера. Правда одна —
   * серверная. У закрытой двери — null.
   */
  position: Position | null;
  /** Записи ходов по порядку. */
  moves: string[];
  lastMove: { from: string; to: string } | null;
  /** Чья очередь; вне партии — null. */
  turn: Side | null;
  /**
   * Клетки, закрытые рубашкой: чужая половина во время расстановки. Зритель и
   * экран видят закрытыми обе — трансляцию смотрит и соперник.
   */
  covered: string[];
  /** Кто уже нажал «готов». Вне расстановки — пусто. */
  setupReady: boolean[];
  /** «Алко»: висит окно — кто пьёт и кто подтверждает. */
  toast: { drinker: Side; pourer: Side } | null;
  /** «Алко»: сколько выпито каждым. */
  drinks: number[];
  /** «Анархия»: отменённые ходы — их показывают перечёркнутыми. */
  vetoed: { ply: number; san: string }[];
  /** Есть ли прямо сейчас основание требовать ничью. */
  claimable: "threefold" | "fiftyMoves" | null;
  /** Кто предложил ничью и ждёт ответа. Видят только сидящие за столом. */
  drawOffer: Side | null;
  result: Result | null;
  reason: EndReason | null;
  timeControl: TimeControl | null;
}

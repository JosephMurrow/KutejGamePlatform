import {
  markKey,
  piece,
  type Piece,
  type PieceKind,
  type Side,
} from "./pieces";
import type { Position } from "./position";

/**
 * Кадры перемотки: какой была доска после каждого полухода.
 *
 * Клиент сам партию не восстановит: половина режимов бросает кости по зерну
 * партии, а зерно до конца партии — секрет, иначе по нему видно следующую
 * карту загула. Поэтому кадры считает сервер и шлёт их вместе со снимком — так
 * решил хозяин (docs/PLAN.md, этап 15г).
 *
 * Шлются они на каждый снимок, поэтому сжаты: первая доска целиком, дальше —
 * только клетки, которые изменились. Обычный ход — две клетки, рокировка —
 * четыре, событие загула — сколько тронуло. Сотня полуходов — пара килобайт.
 *
 * Кадр показывает доску, а не всё состояние: резерв, счётчики и эффекты
 * перемотка не восстанавливает — она для того, чтобы посмотреть, как стояли
 * фигуры.
 */

export interface Replay {
  /** Начальная доска: клетки через запятую, пустая клетка — пустая строка. */
  readonly start: string;
  /** Чей ход в начальной позиции. */
  readonly turn: Side;
  /**
   * Кадр на каждый полуход: `откуда-куда|чей ход|клетка:фигура,…`. Откуда и
   * куда — записями клеток, как у последнего хода; фигура — вид, сторона и
   * метки, пусто — клетку освободили.
   */
  readonly frames: readonly string[];
}

/** Один шаг партии: позиция после хода и сам ход. */
export interface ReplayStep {
  readonly position: Position;
  readonly move: { readonly from: string; readonly to: string } | null;
}

/** Развёрнутый кадр: доска, последний ход и чья очередь. */
export interface ReplayFrame {
  readonly board: readonly (Piece | null)[];
  readonly lastMove: { from: string; to: string } | null;
  readonly turn: Side;
}

/** Фигура строкой: вид, сторона, метки. `p0`, `q1m`, `n0as`. */
function cellCode(cell: Piece | null): string {
  return cell ? `${cell.kind}${cell.side}${markKey(cell)}` : "";
}

/** Строка обратно в фигуру; пустая — пустая клетка. */
function cellOf(code: string): Piece | null {
  if (code === "") return null;

  const marks = code.slice(2);
  return piece(code[0] as PieceKind, Number(code[1]), {
    mega: marks.includes("m"),
    agent: marks.includes("a"),
    awake: marks.includes("w"),
    shield: marks.includes("s"),
  });
}

/**
 * Сжать шаги партии в кадры. Первый шаг — начальная позиция, у неё хода нет.
 * Позиции приходят уже такими, какими их видит зритель: чужой двойной агент
 * спрятан до сжатия, и в кадрах его нет.
 */
export function encodeReplay(steps: readonly ReplayStep[]): Replay | null {
  const first = steps[0];
  if (!first) return null;

  const frames: string[] = [];
  let previous = first.position.board;

  for (const step of steps.slice(1)) {
    const board = step.position.board;
    const changes: string[] = [];

    board.forEach((cell, square) => {
      if (cellCode(cell) !== cellCode(previous[square] ?? null)) {
        changes.push(`${square}:${cellCode(cell)}`);
      }
    });

    const move = step.move ? `${step.move.from}-${step.move.to}` : "";
    frames.push(`${move}|${step.position.turn}|${changes.join(",")}`);
    previous = board;
  }

  return {
    start: first.position.board.map(cellCode).join(","),
    turn: first.position.turn,
    frames,
  };
}

/** Развернуть кадры в доски: нулевой — начальная позиция, дальше по ходу. */
export function decodeReplay(replay: Replay): ReplayFrame[] {
  let board: (Piece | null)[] = replay.start.split(",").map(cellOf);
  const list: ReplayFrame[] = [{ board, lastMove: null, turn: replay.turn }];

  for (const frame of replay.frames) {
    const [move = "", turn = "0", changes = ""] = frame.split("|");
    board = board.slice();

    for (const change of changes === "" ? [] : changes.split(",")) {
      const [square, code = ""] = change.split(":");
      board[Number(square)] = cellOf(code);
    }

    const [from, to] = move.split("-");
    list.push({
      board,
      lastMove: from && to ? { from, to } : null,
      turn: Number(turn),
    });
  }

  return list;
}

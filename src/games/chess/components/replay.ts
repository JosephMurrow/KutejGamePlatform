import { Chess } from "chess.js";

/**
 * Перемотка партии и взятые фигуры — всё, что считается из списка ходов.
 *
 * Считается на клиенте и **ничего не отправляет на сервер**: перемотка не
 * действие, а способ посмотреть. Партия при этом идёт своим чередом, и стоит
 * человеку вернуться к последнему ходу, он снова играет
 * (src/games/chess/docs/BACKLOG.md G).
 */

/** Начальная расстановка. */
export const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Позиция после каждого полухода, начиная с начальной. */
export interface Frame {
  fen: string;
  /** Откуда и куда ходили, чтобы подсветить; у начальной — `null`. */
  lastMove: { from: string; to: string } | null;
}

/**
 * Развернуть запись партии в позиции.
 *
 * Ходы приходят нотацией — так их отдаёт сервер. Опечаток тут быть не может,
 * но если запись всё же оборвётся, дальше просто нечего показывать: обрубок
 * лучше пустой доски.
 */
export function frames(moves: readonly string[]): Frame[] {
  const chess = new Chess();
  const list: Frame[] = [{ fen: chess.fen(), lastMove: null }];

  for (const san of moves) {
    try {
      const made = chess.move(san);
      list.push({
        fen: chess.fen(),
        lastMove: { from: made.from, to: made.to },
      });
    } catch {
      break;
    }
  }

  return list;
}

/** Цена фигур в пешках. Король не считается: он есть у обоих всегда. */
const WORTH: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
/** Сколько чего стоит на доске в начале партии. */
const FULL: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

/** Что у соперника съедено и на сколько ты впереди. */
export interface Taken {
  /** Фигуры белых, снятые с доски: `p`, `n`, `b`, `r`, `q` по убыванию цены. */
  white: string[];
  black: string[];
  /** Перевес белых в пешках; минус — впереди чёрные. */
  edge: number;
}

/** Кого не хватает на доске против начальной расстановки. */
export function taken(fen: string): Taken {
  const left: Record<string, number> = {};
  for (const letter of fen.split(" ")[0] ?? "") {
    if (/[pnbrqPNBRQ]/.test(letter)) left[letter] = (left[letter] ?? 0) + 1;
  }

  const gone = (type: string, white: boolean) => {
    const letter = white ? type.toUpperCase() : type;
    return Math.max(0, (FULL[type] ?? 0) - (left[letter] ?? 0));
  };

  const white: string[] = [];
  const black: string[] = [];
  let edge = 0;

  // По убыванию цены: так ряд взятых читается сразу, без пересчёта.
  for (const type of ["q", "r", "b", "n", "p"]) {
    const worth = WORTH[type] ?? 0;
    const lostWhite = gone(type, true);
    const lostBlack = gone(type, false);

    white.push(...Array<string>(lostWhite).fill(type));
    black.push(...Array<string>(lostBlack).fill(type));
    edge += (lostBlack - lostWhite) * worth;
  }

  return { white, black, edge };
}

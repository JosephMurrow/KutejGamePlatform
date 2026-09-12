import { alive, type Position, STALL_PLIES } from "../engine/position";
import type { Side } from "../engine/pieces";
import { attacked, inCheck, reachedThrone } from "../engine/moves";
import { PIECE_VALUE } from "../modes/points";

/**
 * Оценка позиции для бота: одна функция на все шестнадцать режимов.
 *
 * Бот про режимы не знает и знать не должен — он читает **цель партии** из
 * `Position.rules.goal`, и от неё зависит, что считать хорошим. Мат, истребление
 * и поддавки — это три разные арифметики на одной доске: там, где в обычной
 * партии материал копят, в поддавках его сбрасывают, а в «на уничтожение» он
 * вообще не главный, потому что считаются не номиналы, а головы
 * (docs/MODES.md, режимы 3 и 11).
 *
 * Шкала — сотые доли пешки: пешка весит 100. В той же шкале живут надбавки
 * характера (`characters.ts`) и допуск зевка (`levels.ts`).
 */

/** Выигранная партия: больше любой разницы в материале. */
export const WIN_SCORE = 1_000_000;

/** Чем кончилась партия, если она кончилась. */
export interface Resolution {
  winner: Side | "draw";
}

/**
 * Кончилась ли партия в этой позиции.
 *
 * Повторяет `TurboGame.detect()`, но без истории: повторения и пятьдесят ходов
 * бот не ищет — они нужны сопернику как заявка, а не перебору как цель. Число
 * ходов передаётся снаружи: перебор уже его посчитал, а второй вызов
 * `legalMoves` на доске 16×16 стоит дороже всей оценки.
 */
export function terminal(position: Position, moves: number): Resolution | null {
  const { rules, sides } = position;

  if (rules.goal === "feed") {
    // Поддавки: чьего короля съели, тот и победил.
    const fed = sides.findIndex((_, side) => !hasKing(position, side));
    if (fed >= 0) return { winner: fed };
    // Ходить нечем — отдавать больше нечего, и это победа.
    return moves === 0 ? { winner: position.turn } : null;
  }

  if (rules.goal === "wipe") {
    const wiped = sides.findIndex(
      (_, side) => !position.board.some((cell) => cell?.side === side),
    );
    if (wiped >= 0) return { winner: opponent(position, wiped) };
    if (moves === 0 || position.sinceCapture >= STALL_PLIES) {
      return counted(position);
    }
    return null;
  }

  if (rules.goal === "battle") {
    const standing = sides.flatMap((_, side) =>
      alive(position, side) ? [side] : [],
    );
    const last = standing[0];
    if (standing.length === 1 && last !== undefined) return { winner: last };
    // Запертый без шаха пропускает ход, а не выбывает: это разбирает комната.
    return null;
  }

  // Мега-шахматы: король, дошедший до чужого трона, кончает партию сразу.
  if (rules.mega) {
    const throne = position.board.findIndex(
      (cell, square) =>
        cell?.kind === "k" && reachedThrone(position, cell.side, square),
    );
    const king = throne >= 0 ? position.board[throne] : null;
    if (king) return { winner: king.side };
  }

  const kingless = sides.findIndex((_, side) => !hasKing(position, side));
  if (kingless >= 0) return { winner: opponent(position, kingless) };

  if (moves === 0) {
    if (inCheck(position, position.turn)) {
      return { winner: opponent(position, position.turn) };
    }
    return rules.stalemate === "loss"
      ? { winner: opponent(position, position.turn) }
      : { winner: "draw" };
  }

  return null;
}

/** Счёт по головам: кто взял больше фигур. Поровну — ничья. */
function counted(position: Position): Resolution {
  const counts = position.taken.map((list) => list.length);
  const best = Math.max(...counts);
  const leaders = counts.filter((count) => count === best).length;

  return { winner: leaders === 1 ? counts.indexOf(best) : "draw" };
}

function hasKing(position: Position, side: Side): boolean {
  return position.board.some(
    (cell) => cell?.kind === "k" && cell.side === side,
  );
}

/** Кто остался против этой стороны. На двоих — другой; в битве — следующий живой. */
function opponent(position: Position, side: Side): Side {
  const sides = position.sides.length;
  for (let step = 1; step <= sides; step++) {
    const next = (side + step) % sides;
    if (position.rules.goal !== "battle" || alive(position, next)) return next;
  }
  return (side + 1) % sides;
}

/** Итог партии в очках для этой стороны. */
export function resolved(resolution: Resolution, side: Side): number {
  if (resolution.winner === "draw") return 0;
  return resolution.winner === side ? WIN_SCORE : -WIN_SCORE;
}

interface Survey {
  /** Материал каждой стороны в сотых долях пешки, с резервом и зомби. */
  material: number[];
  /** Активность: центр и продвижение. */
  activity: number[];
  /** Где стоит король каждой стороны; `-1` — короля нет. */
  king: number[];
  /** Сколько видов фигур, кроме короля, на доске вообще. */
  kinds: number;
}

/**
 * Один проход по доске на всё сразу.
 *
 * Оценка зовётся в каждом листе перебора, а доска бывает 16×16 — это 256 клеток
 * на вызов. Второй проход по той же доске ради центра или короля удвоил бы цену
 * всего перебора, поэтому здесь считается всё за раз.
 */
function survey(position: Position): Survey {
  const { geometry, board, sides } = position;
  const count = sides.length;
  const material = new Array<number>(count).fill(0);
  const activity = new Array<number>(count).fill(0);
  const king = new Array<number>(count).fill(-1);
  const seen = new Set<string>();

  const midX = (geometry.width - 1) / 2;
  const midY = (geometry.height - 1) / 2;
  const span = midX + midY;

  board.forEach((cell, square) => {
    if (!cell) return;
    const side = cell.side;
    if (side >= count) return;

    material[side] = (material[side] ?? 0) + PIECE_VALUE[cell.kind] * 100;
    if (cell.kind === "k") {
      king[side] = square;
      return;
    }
    seen.add(cell.kind);

    const x = square % geometry.width;
    const y = Math.floor(square / geometry.width);
    const centre =
      span === 0 ? 0 : 1 - (Math.abs(x - midX) + Math.abs(y - midY)) / span;
    const forward = progress(position, side, x, y);

    activity[side] =
      (activity[side] ?? 0) +
      centre * 12 +
      forward * (cell.kind === "p" ? 24 : 8);
  });

  // Резерв и дозревающие зомби — это тоже материал, просто ещё не на доске.
  position.reserve.forEach((kinds, side) => {
    const held = kinds.reduce((sum, kind) => sum + PIECE_VALUE[kind] * 100, 0);
    material[side] = (material[side] ?? 0) + Math.round(held * 0.8);
  });
  position.pending.forEach((zombie) => {
    const owner = zombie.side;
    material[owner] =
      (material[owner] ?? 0) + Math.round(PIECE_VALUE[zombie.kind] * 100 * 0.4);
  });

  return { material, activity, king, kinds: seen.size };
}

/** Насколько фигура продвинулась к чужому краю: ноль у своего, единица у чужого. */
function progress(
  position: Position,
  side: Side,
  x: number,
  y: number,
): number {
  const rules = position.sides[side];
  if (!rules) return 0;

  const [dx, dy] = rules.forward;
  const { width, height } = position.geometry;
  const reach = Math.abs(dx) * (width - 1) + Math.abs(dy) * (height - 1);
  if (reach === 0) return 0;

  const done =
    dx * x + dy * y + (dx < 0 ? width - 1 : 0) + (dy < 0 ? height - 1 : 0);

  return done / reach;
}

/**
 * Оценка позиции глазами этой стороны. Больше — лучше для неё.
 *
 * Партия, уже кончившаяся, сюда не попадает: её разбирает `terminal`.
 */
export function evaluate(position: Position, side: Side): number {
  const { material, activity, king, kinds } = survey(position);
  const mine = material[side] ?? 0;
  const myActivity = activity[side] ?? 0;

  if (position.rules.goal === "wipe") {
    // Считаются головы, а не номиналы: взятая пешка здесь равна взятому ферзю.
    const heads = position.taken.map((list) => list.length);
    const taken = (heads[side] ?? 0) - best(heads, side);
    const left = mine - best(material, side);
    return taken * 400 + left * 0.4 + myActivity * 0.5;
  }

  if (position.rules.goal === "feed") {
    // Поддавки: материал со знаком минус, а король под боем — удача, а не беда.
    // `inCheck` здесь молчит (король не королевский), поэтому спрашиваем прямо.
    const at = king[side] ?? -1;
    const bait = at >= 0 && attacked(position, at, side) ? 250 : 0;
    return best(material, side) - mine + bait;
  }

  const rivals = best(material, side);
  let score = mine - rivals;

  // Где все фигуры одного вида, номиналы не различают ничего: остаётся
  // активность, безопасность короля и продвижение (docs/BOTS.md, режим 1).
  score += kinds <= 1 ? myActivity * 3 : myActivity;

  const mySafety = safety(position, side, king[side] ?? -1);
  score += mySafety;

  if (position.rules.goal === "battle") {
    // В битве важен не общий счёт, а сильнейший сосед: добивают того, кто рядом.
    score = mine - rivals + myActivity * 0.6 + mySafety;
  }

  return score;
}

/** Материал (или счёт) сильнейшего живого соперника. */
function best(values: readonly number[], side: Side): number {
  let top = 0;
  values.forEach((value, at) => {
    if (at !== side && value > top) top = value;
  });
  return top;
}

/** Безопасность короля: под шахом плохо, прикрытым — хорошо. */
function safety(position: Position, side: Side, king: number): number {
  if (king < 0) return -WIN_SCORE / 2;
  if (
    !position.rules.goal.startsWith("mate") &&
    position.rules.goal !== "battle"
  ) {
    return 0;
  }

  const { width } = position.geometry;
  let cover = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const at = king + dx + dy * width;
      const x = (king % width) + dx;
      if (x < 0 || x >= width || at < 0 || at >= position.board.length)
        continue;
      if (position.board[at]?.side === side) cover++;
    }
  }

  const checked = inCheck(position, side) ? -60 : 0;
  return Math.min(cover, 4) * 10 + checked;
}

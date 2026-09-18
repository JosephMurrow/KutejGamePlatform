import { legalMoves, type Move, play } from "../engine/moves";
import type { Position } from "../engine/position";
import type { Side } from "../engine/pieces";
import { PIECE_VALUE } from "../modes/points";
import { evaluate, resolved, terminal, WIN_SCORE } from "./evaluate";

/**
 * Перебор бота: два-три полухода, своя оценка, потолок просмотра.
 *
 * Глубины хватает намеренно: для мемных правил не нужна ни сила, ни скорость —
 * нужна гибкость, потому что шестнадцать режимов меняют не только оценку, но и
 * само понятие конца партии (docs/BACKLOG.md E1).
 *
 * **Почему не минимакс со сменой знака.** Минимакс считает, что чужой плюс —
 * это мой минус, а в королевской битве за столом четверо: ход, который портит
 * жизнь северному, может быть подарком западному. Поэтому каждый узел
 * максимизирует **свою** оценку, а наверх отдаёт оценки всех сторон — это maxn.
 * На двоих он вырождается в обычный минимакс, и отдельного кода на два игрока
 * не нужно.
 *
 * **Почему с углублением.** Доска 16×16 на четверых даёт больше сотни ходов в
 * узле: «глубина 3» там — это миллионы позиций. Поэтому глубина заявленная, а
 * берётся она шагами, пока цел бюджет просмотра; что успели — то и играем.
 * Лучше честный ход с глубины 1, чем пустая минута ожидания.
 */

/** Ход и чего он стоит. */
export interface Candidate {
  move: Move;
  /** Оценка глазами того, кто ходит. */
  score: number;
}

export interface SearchLimits {
  /** До скольких полуходов дойти, если бюджет позволит. */
  depth: number;
  /** Потолок просмотренных позиций. */
  nodes: number;
}

export interface SearchResult {
  /** Ходы от лучшего к худшему. */
  candidates: Candidate[];
  /** До какой глубины успели дойти. */
  depth: number;
  /** Сколько позиций посмотрели. */
  nodes: number;
}

/**
 * Бюджет в пересчёте на стоимость узла.
 *
 * Узел на доске 16×16 стоит вчетверо дороже узла на 8×8: двести пятьдесят шесть
 * клеток вместо шестидесяти четырёх на каждый просмотр доски, и фигур вдвое
 * больше. Поэтому потолок уровня задан в «узлах обычной доски», а здесь
 * переводится в настоящие: иначе «Эксперт» на королевской битве думал бы
 * секунды, и комната ждала бы его вместе с тремя живыми игроками.
 */
function affordable(position: Position, nodes: number): number {
  const area = position.geometry.width * position.geometry.height;
  return Math.round(nodes * Math.min(1, 64 / area));
}

/** Счётчик бюджета: один на весь перебор. */
interface Budget {
  left: number;
}

/**
 * Перебрать ходы стороны, чья очередь.
 *
 * Пустой список кандидатов значит, что ходить нечем — партия кончилась, и
 * разбирать её дальше не боту.
 */
export function search(position: Position, limits: SearchLimits): SearchResult {
  const moves = legalMoves(position);
  if (moves.length === 0) {
    return { candidates: [], depth: 0, nodes: 0 };
  }

  const side = position.turn;
  const allowance = Math.max(affordable(position, limits.nodes), moves.length);
  const budget: Budget = { left: allowance };

  // Первый проход — по одному полуходу: он и даёт порядок для следующих, и
  // страхует от обрыва бюджета на глубине.
  let candidates = moves
    .map((move) => {
      budget.left--;
      return { move, score: shallow(position, move, side) };
    })
    .sort(byScore);
  let reached = 1;

  for (let depth = 2; depth <= limits.depth; depth++) {
    if (budget.left <= 0) break;

    const deeper: Candidate[] = [];
    for (const { move } of candidates) {
      if (budget.left <= 0) break;
      const next = play(position, move);
      const scores = maxn(next, depth - 1, budget);
      deeper.push({ move, score: scores[side] ?? 0 });
    }

    // Обрыв на середине списка оставил бы часть ходов без новой оценки, и
    // сравнивать их было бы нечестно: берём только полный проход.
    if (deeper.length !== candidates.length) break;

    candidates = deeper.sort(byScore);
    reached = depth;
  }

  return {
    candidates,
    depth: reached,
    nodes: allowance - budget.left,
  };
}

/** Оценка хода без продолжений: лист первого прохода. */
function shallow(position: Position, move: Move, side: Side): number {
  const next = play(position, move);
  const resolution = terminal(next, legalMoves(next).length);

  return resolution ? resolved(resolution, side) : evaluate(next, side);
}

/**
 * Оценки всех сторон в этой позиции при глубине `depth`.
 *
 * Тот, чья очередь, выбирает ход по своей оценке, а наверх уходит весь вектор:
 * родителю нужна своя строчка, и пересчитывать её заново было бы вдвое дороже.
 */
function maxn(position: Position, depth: number, budget: Budget): number[] {
  budget.left--;

  // Считать ходы дорого, и на листе они не нужны. Но без них нельзя отличить
  // мат от обычной позиции, поэтому там, где ходы не считались, `terminal`
  // получает единицу: «ходы есть» — и отвечает только на то, что видно по
  // доске, то есть на съеденного короля, подчистую и выбывание.
  const counted = depth > 0 && budget.left > 0;
  const moves = counted ? legalMoves(position) : [];
  const resolution = terminal(position, counted ? moves.length : 1);
  if (resolution) {
    return position.sides.map((_, side) => resolved(resolution, side));
  }

  if (!counted || moves.length === 0) {
    return position.sides.map((_, side) => evaluate(position, side));
  }

  const mover = position.turn;
  let best: number[] | null = null;

  // Взятия первыми: на обрыве бюджета важно, чтобы успели посмотреть главное.
  for (const move of order(moves)) {
    if (budget.left <= 0) break;
    const scores = maxn(play(position, move), depth - 1, budget);
    if (!best || (scores[mover] ?? 0) > (best[mover] ?? 0)) best = scores;
  }

  return best ?? position.sides.map((_, side) => evaluate(position, side));
}

/** Ходы в том порядке, в каком их стоит смотреть: сначала взятия подороже. */
function order(moves: readonly Move[]): Move[] {
  return [...moves].sort((left, right) => worth(right) - worth(left));
}

function worth(move: Move): number {
  const prize = move.captured ? PIECE_VALUE[move.captured.kind] * 10 : 0;
  const growth = move.promotion ? PIECE_VALUE[move.promotion] : 0;
  return prize + growth;
}

function byScore(left: Candidate, right: Candidate): number {
  return right.score - left.score;
}

/** Ход, который кончает партию победой: такие видно и без глубины. */
export function winning(candidate: Candidate): boolean {
  return candidate.score >= WIN_SCORE;
}

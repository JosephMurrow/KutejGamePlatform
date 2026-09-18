import { type Move, play, pseudoMoves } from "../engine/moves";
import type { Position } from "../engine/position";
import type { Side } from "../engine/pieces";
import type { Level } from "./levels";
import type { Candidate } from "./search";

/**
 * Тупик в пацанских шахматах.
 *
 * Назад ходов нет, и остаться без ходов — не пат, а поражение (docs/MODES.md,
 * режим 6). Перебор на два-три полухода тупика в четыре хода не увидит: фигуры
 * упираются постепенно, и последний ход выглядит обычным.
 *
 * Решено хозяином по-разному для разных уровней: сильные себя берегут, слабые
 * честно загоняют — на слабом уровне это анекдот, на сильном глупость
 * ([BOTS.md](../docs/BOTS.md), режим 6).
 */

/** Ниже этого числа ходов сторона считается зажатой. */
const ROOMY = 10;

/** Сколько стоит каждый недостающий ход, в сотых долях пешки. */
const PRICE = 8;

/** Надо ли этому уровню в этом режиме бояться тупика. */
export function cornered(position: Position, level: Level): boolean {
  return position.rules.forwardOnly && level.sloppiness <= 0.05;
}

/** Сколько ходов есть у стороны: свобода, которую легко потерять безвозвратно. */
export function freedom(position: Position, side: Side): number {
  // Ходы считаются для того, чья очередь, а нам нужна своя сторона: подменяем
  // очередь на копии позиции. Позиция неизменяемая, оригинал не страдает.
  const asked = side === position.turn ? position : { ...position, turn: side };
  return pseudoMoves(asked).length;
}

/**
 * Пересчитать кандидатов со штрафом за тесноту.
 *
 * Штраф небольшой и ограниченный: он переставляет равноценные ходы, а не
 * заставляет отдавать фигуру ради простора.
 */
export function squeeze(
  position: Position,
  candidates: readonly Candidate[],
): Candidate[] {
  const side = position.turn;

  return candidates
    .map((candidate) => ({
      ...candidate,
      score: candidate.score - cost(position, candidate.move, side),
    }))
    .sort((left, right) => right.score - left.score);
}

function cost(position: Position, move: Move, side: Side): number {
  const left = freedom(play(position, move), side);
  return Math.max(0, ROOMY - left) * PRICE;
}

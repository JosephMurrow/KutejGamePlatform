import { squareName } from "../engine/geometry";
import type { Side } from "../engine/pieces";
import type { Move } from "../engine/moves";
import type { Position } from "../engine/position";
import type { DropKind, MoveInput } from "../engine/game";
import { pick, sloppinessOf } from "./blunder";
import type { CharacterTraits } from "./characters";
import { limitsFor, tipsy } from "./drunk";
import type { Level } from "./levels";
import { search } from "./search";
import { cornered, squeeze } from "./stuck";
import { preferStyle } from "./style";
import { pauseMs } from "./tempo";
import { viewFor } from "./view";

/**
 * Голова бота целиком: от позиции до хода, который можно отдать комнате.
 *
 * Порядок важен и он же — весь смысл разделения на файлы: сначала бот видит
 * позицию по своему уровню (`view`), потом перебирает ходы (`search`), потом
 * характер переставляет равноценные (`style`), и только потом уровень решает,
 * ошибиться ли (`blunder`). Перепутать последние два нельзя: характер, который
 * выбирает уже после зевка, перестаёт быть характером и становится вторым
 * зевком.
 *
 * Про режимы здесь нет ни слова. Ходы приходят из движка, и выставление из
 * резерва, щит, мега-формы и четыре стороны уже лежат в их списке.
 */

export interface Think {
  /** Полная позиция, как её знает комната. */
  position: Position;
  /** Место бота за столом. */
  seat: Side;
  level: Level;
  traits: CharacterTraits;
  /** Номер полухода: по нему считается усталость характера. */
  ply: number;
  /** Сколько бот выпил в алко-шахматах; в остальных режимах ноль. */
  drinks?: number;
  /** Бросок от зерна партии: случайность у нас только воспроизводимая. */
  roll: () => number;
  /** Остаток времени на ход, если он ограничен. */
  limitMs?: number | null;
}

export interface Thought {
  /** Что отдать комнате: та же форма, что присылает человек. */
  input: MoveInput;
  move: Move;
  /** Оценка выбранного хода глазами бота. */
  score: number;
  /** До какой глубины успел дойти перебор. */
  depth: number;
  nodes: number;
  /** Сколько «думать» перед тем, как отправить ход. */
  pauseMs: number;
}

/**
 * Подумать и выбрать ход. `null` — ходить нечем: это не ошибка бота, а конец
 * партии, и разбирает его комната.
 */
export function think(request: Think): Thought | null {
  const { position, seat, level, traits, ply, roll } = request;
  if (position.turn !== seat) return null;

  const seen = viewFor(position, seat, level);
  const drunk = tipsy(level, traits, request.drinks ?? 0);
  const result = search(seen, limitsFor(level, drunk.depth));
  if (result.candidates.length === 0) return null;

  const careful = cornered(seen, level)
    ? squeeze(seen, result.candidates)
    : result.candidates;
  const tasted = preferStyle(seen, careful, traits.style);

  const slop = sloppinessOf(level, traits, ply);
  const chosen = pick(
    tasted,
    {
      chance: Math.min(0.85, slop.chance + drunk.sloppy),
      maxLoss: slop.maxLoss,
    },
    roll,
  );
  if (!chosen) return null;

  return {
    input: inputOf(seen, chosen.move),
    move: chosen.move,
    score: chosen.score,
    depth: result.depth,
    nodes: result.nodes,
    pauseMs: pauseMs(
      level,
      traits,
      result.candidates.length,
      roll,
      request.limitMs ?? null,
    ),
  };
}

/** Ход в той форме, в какой его присылает человек. */
export function inputOf(position: Position, move: Move): MoveInput {
  const { geometry } = position;
  const to = squareName(geometry, move.to);

  if (move.from < 0) {
    return { to, drop: move.piece.kind as DropKind };
  }

  return {
    from: squareName(geometry, move.from),
    to,
    ...(move.promotion
      ? { promotion: move.promotion as "q" | "r" | "b" | "n" }
      : {}),
  };
}

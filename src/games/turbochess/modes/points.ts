import type { PieceKind, Side } from "../engine/pieces";
import type { Position } from "../engine/position";

/**
 * Общая шкала номиналов (docs/MODES.md, «Общее для всех режимов»). Ею считают
 * заряд ядерных и очки чёрного рынка — одна шкала на всю игру, чтобы «ферзь
 * дороже ладьи» не значило в двух режимах разного.
 */
export const PIECE_VALUE: Record<PieceKind, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  /** Короля в обычных шахматах не берут — очков за него не бывает. */
  k: 0,
};

/** Сколько очков сторона набрала взятиями: сумма номиналов забранного. */
export function pointsOf(position: Position, side: Side): number {
  return (position.taken[side] ?? []).reduce(
    (total, taken) => total + (PIECE_VALUE[taken.kind] ?? 0),
    0,
  );
}

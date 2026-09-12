import { marked, piece, type Piece, type Side } from "../engine/pieces";
import { classicPosition, type Position } from "../engine/position";

/**
 * Режим 10, «Двойной агент» (docs/MODES.md): у каждого одна фигура тайно
 * работает на соперника — им можно сходить вместо своего хода.
 *
 * Агентов выбирает сервер по зерну случайности партии: зерно пишется в запись
 * с первого этапа, и по нему партия воспроизводится (docs/MODES.md, «Общее»).
 * Дальше метка едет вместе с фигурой, а секрет держит снимок комнаты: свой
 * агент хозяину не виден.
 */

/** Тот же ГПСЧ, что в сверке движка: одно зерно — одна и та же партия. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Начальная позиция: у каждой стороны одна случайная фигура, кроме короля,
 * становится двойным агентом.
 */
export function agentPosition(seed: number): Position {
  const start = classicPosition();
  const roll = mulberry32(seed);
  const board = [...start.board];

  start.sides.forEach((_, side) => {
    const mine: number[] = [];
    board.forEach((cell, square) => {
      if (cell && cell.side === side && cell.kind !== "k") mine.push(square);
    });

    const at = mine[Math.floor(roll() * mine.length)];
    const chosen = at === undefined ? null : board[at];
    if (at !== undefined && chosen) board[at] = marked(chosen, { agent: true });
  });

  return { ...start, board };
}

/**
 * Позиция для этого зрителя: свой агент — секрет от хозяина, чужой виден
 * только тому, кто может его пробудить. Пробуждённого видят все.
 *
 * Прятать это на клиенте было бы занавеской: в снимке лежит то, что можно
 * прочитать. Поэтому метку снимает сервер — до того, как снимок уйдёт.
 */
export function hideAgents(position: Position, seat: Side | null): Position {
  const secret = (cell: Piece | null): cell is Piece =>
    cell !== null && Boolean(cell.agent) && !cell.awake;

  const board = position.board.map((cell) =>
    secret(cell) && (seat === null || cell.side === seat)
      ? piece(cell.kind, cell.side, { mega: cell.mega })
      : cell,
  );

  return { ...position, board };
}

/** Правила для игрока — на карточке перед стартом и по кнопке у доски. */
export function agentRules(): string[] {
  return [
    "В начале партии одна ваша фигура, кроме короля, тайно работает на соперника — и одна его на вас. Какая ваша, вы не знаете: знает он.",
    "Чужой агент подсвечен вам рамкой. Сходить им — вместо своего хода: фигура остаётся его цвета и бьёт его врагов, то есть ваши фигуры она не тронет.",
    "Первый такой ход пробуждает агента: дальше его видят оба и ходят им оба до конца партии.",
    "Пробуждение одно на фигуру. Всё остальное — обычные шахматы.",
  ];
}

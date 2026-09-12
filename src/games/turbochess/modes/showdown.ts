import { CLASSIC, squareAt, type Geometry } from "../engine/geometry";
import { piece, type Piece, type PieceKind, type Side } from "../engine/pieces";
import { CLASSIC_RULES, TWO_SIDES, type Position } from "../engine/position";

/**
 * Режим 16, «Вскрываемся» (docs/MODES.md): перед партией каждый расставляет
 * свои шестнадцать фигур на своих двух горизонталях, чужой расстановки не
 * видно, потом обе вскрываются разом.
 *
 * Здесь — только сама расстановка: её зона, порядок клеток, обмен местами и
 * сборка позиции. Фаза расстановки, её часы и «готов» живут в комнате: движок
 * получает уже вскрытую позицию и играет обычную партию.
 */

/** Сколько дают на расстановку. Девяносто секунд — решение хозяина. */
export const SHOWDOWN_SETUP_MS = 90_000;

/**
 * Зона расстановки: шестнадцать клеток своих двух горизонталей. Первые восемь
 * — первая горизонталь, и только там стоит король.
 */
export function showdownZone(
  side: Side,
  geometry: Geometry = CLASSIC,
): number[] {
  const back = side === 0 ? 0 : geometry.height - 1;
  const step = side === 0 ? 1 : -1;
  const zone: number[] = [];

  for (const line of [back, back + step]) {
    for (let x = 0; x < geometry.width; x++)
      zone.push(squareAt(geometry, x, line));
  }

  return zone;
}

/** Сколько клеток на первой горизонтали — там и только там стоит король. */
function firstLine(geometry: Geometry = CLASSIC): number {
  return geometry.width;
}

/** Стандартная расстановка в порядке зоны: с неё начинают оба. */
export function showdownStart(): PieceKind[] {
  return [
    "r",
    "n",
    "b",
    "q",
    "k",
    "b",
    "n",
    "r",
    "p",
    "p",
    "p",
    "p",
    "p",
    "p",
    "p",
    "p",
  ];
}

/**
 * Поменять две фигуры местами. `null` — так нельзя: клетка не из зоны или
 * король уехал бы со своей первой горизонтали.
 */
export function showdownSwap(
  arrangement: readonly PieceKind[],
  from: number,
  to: number,
  geometry: Geometry = CLASSIC,
): PieceKind[] | null {
  const size = arrangement.length;
  if (from < 0 || to < 0 || from >= size || to >= size || from === to) {
    return null;
  }

  const swapped = [...arrangement];
  const moved = swapped[from];
  const other = swapped[to];
  if (!moved || !other) return null;

  const line = firstLine(geometry);
  if (moved === "k" && to >= line) return null;
  if (other === "k" && from >= line) return null;

  swapped[from] = other;
  swapped[to] = moved;
  return swapped;
}

/**
 * Позиция из расстановок обеих сторон. `null` вместо расстановки оставляет
 * зону пустой: так же собирается доска, которую игрок видит до вскрытия, —
 * своя половина на месте, чужая пуста и закрыта рубашкой.
 */
export function showdownPosition(
  arrangements: readonly (readonly PieceKind[] | null)[],
): Position {
  const geometry = CLASSIC;
  const board: (Piece | null)[] = Array.from(
    { length: geometry.width * geometry.height },
    () => null,
  );

  arrangements.forEach((arrangement, side) => {
    if (!arrangement) return;
    const zone = showdownZone(side, geometry);
    arrangement.forEach((kind, index) => {
      const square = zone[index];
      if (square !== undefined) board[square] = piece(kind, side);
    });
  });

  return {
    geometry,
    sides: TWO_SIDES,
    rules: CLASSIC_RULES,
    board,
    turn: 0,
    // Рокировки нет: король стоит где угодно на первой горизонтали, ладьи —
    // где угодно вообще, и прятать его за ладью незачем.
    castling: [],
    enPassant: null,
    quiet: 0,
    sinceCapture: 0,
    taken: [[], []],
    reserve: [[], []],
    pending: [],
    chances: [],
    vetoes: [],
    banned: null,
  };
}

/** Расстановка строкой — для записи партии: без неё её не перемотать. */
export function showdownNote(
  arrangements: readonly (readonly PieceKind[] | null)[],
): string {
  return arrangements
    .map((arrangement) => (arrangement ?? []).join(""))
    .join("/");
}

/** Правила для игрока — на карточке перед стартом и по кнопке у доски. */
export function showdownRules(): string[] {
  return [
    "Перед партией каждый расставляет свои шестнадцать фигур на своих двух горизонталях в любом порядке. Король — только на первой.",
    "Чужая половина закрыта рубашкой, пока оба не нажали «готов» или не кончилось время. Тогда обе расстановки открываются разом.",
    "Расстановка начинается со стандартной: меняйте фигуры местами перетаскиванием. Кто ничего не тронул, играет обычными шахматами.",
    "Пешку можно поставить и на первую горизонталь: ходить она будет на одну клетку, двойной шаг — только со второй.",
    "Рокировки нет, слоны могут оказаться на полях одного цвета — это ваш выбор. После вскрытия первыми ходят белые.",
  ];
}

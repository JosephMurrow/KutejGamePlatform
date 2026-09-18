/**
 * Доска как сетка: размер, имена клеток, шаг по вектору.
 *
 * Внутри движка клетка — число `y * width + x`: `x` — вертикаль с нуля
 * (`a` — ноль), `y` — горизонталь с нуля (первая — ноль). Наружу — строка вида
 * `e4` или `p16`: так клетки уже ходят по проводу у шахмат, и тип на проводе
 * менять не придётся (docs/BACKLOG.md B2).
 *
 * Размер не зашит: у пятнадцати режимов доска 8×8, у королевской битвы —
 * 16×16 (docs/MODES.md, режим 9).
 */

export interface Geometry {
  readonly width: number;
  readonly height: number;
}

/** Вектор шага: на сколько вертикалей и горизонталей. */
export type Vec = readonly [dx: number, dy: number];

/** Обычная доска. */
export const CLASSIC: Geometry = { width: 8, height: 8 };

/**
 * Самая широкая доска, которую понимает библиотека доски: букву вертикали она
 * берёт из кода символа, и после `z` имена клеток ломаются
 * (docs/BACKLOG.md B2). Для 16×16 запаса хватает.
 */
export const MAX_FILES = 26;

export function squareAt(geometry: Geometry, x: number, y: number): number {
  return y * geometry.width + x;
}

export function fileOf(geometry: Geometry, square: number): number {
  return square % geometry.width;
}

export function rankOf(geometry: Geometry, square: number): number {
  return Math.floor(square / geometry.width);
}

export function inside(geometry: Geometry, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < geometry.width && y < geometry.height;
}

/** Клетка на шаг `vec`, взятый `times` раз; `null` — за краем доски. */
export function offset(
  geometry: Geometry,
  square: number,
  [dx, dy]: Vec,
  times = 1,
): number | null {
  const x = fileOf(geometry, square) + dx * times;
  const y = rankOf(geometry, square) + dy * times;

  return inside(geometry, x, y) ? squareAt(geometry, x, y) : null;
}

/** Буква вертикали: `a` для первой. */
export function fileLetter(geometry: Geometry, square: number): string {
  return String.fromCharCode(97 + fileOf(geometry, square));
}

export function squareName(geometry: Geometry, square: number): string {
  return `${fileLetter(geometry, square)}${rankOf(geometry, square) + 1}`;
}

const NAME = /^([a-z])([1-9]\d?)$/;

/**
 * Клетка по имени. `null` — имя кривое или клетки на этой доске нет: имя
 * приходит от клиента, и верить ему нельзя ни в одном символе.
 */
export function parseSquare(geometry: Geometry, name: string): number | null {
  const match = NAME.exec(name);
  if (!match) return null;

  const x = (match[1] ?? "").charCodeAt(0) - 97;
  const y = Number(match[2]) - 1;

  return inside(geometry, x, y) ? squareAt(geometry, x, y) : null;
}

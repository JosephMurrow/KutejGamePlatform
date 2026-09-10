import type { ReactNode } from "react";

/**
 * Коробка игры на витрине: форма, торцы, донце и шов.
 *
 * Форма платформенная и одна на все игры — полка читается полкой только тогда,
 * когда коробки сделаны по одному образцу. Игра приносит цвета и рисунок
 * крышки, геометрию не трогает. Правила и размеры — в docs/BOX.md.
 *
 * Рисунок вставляется встроенным SVG, а не файлом-картинкой: у `<img src=.svg>`
 * нет доступа к шрифтам страницы, и надпись на крышке съехала бы на системный.
 */

/** Косоугольная проекция: смотрим чуть сверху и слева, вертикали остаются вертикальными. */
const ORIGIN: Point = [168, 110];
/** Вдоль ширины коробки: вправо и чуть вверх. */
const WIDTH: Point = [472, -58];
/** Вдоль глубины: вправо и вниз, на зрителя. */
const DEPTH: Point = [66, 252];

/** Высота крышки и донца в тех же единицах. */
const LID = 51;
const BASE = 50;
/** Насколько донце уже крышки — отсюда нависание и шов. */
const INSET = 10;

/** Плоская система координат рисунка крышки. */
export const ART_WIDTH = 1000;
export const ART_HEIGHT = 620;

type Point = [number, number];

const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
const drop = (p: Point, dy: number): Point => [p[0], p[1] + dy];
const path = (points: Point[]) =>
  points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

const A = ORIGIN;
const B = add(ORIGIN, WIDTH);
const C = add(add(ORIGIN, WIDTH), DEPTH);
const D = add(ORIGIN, DEPTH);

const [Ab, Cb, Db] = [A, C, D].map((p) => drop(p, LID)) as [
  Point,
  Point,
  Point,
];

/** Центр нижней плоскости крышки: к нему поджимается донце. */
const CENTRE: Point = [(A[0] + C[0]) / 2, (A[1] + C[1]) / 2 + LID];

function squeeze(p: Point): Point {
  const dx = CENTRE[0] - p[0];
  const dy = CENTRE[1] - p[1];
  const len = Math.hypot(dx, dy) || 1;
  return [p[0] + (dx / len) * INSET, p[1] + (dy / len) * INSET];
}

const [Ai, Di, Ci] = [Ab, Db, Cb].map(squeeze) as [Point, Point, Point];
const [Aj, Dj, Cj] = [Ai, Di, Ci].map((p) => drop(p, BASE)) as [
  Point,
  Point,
  Point,
];

/** Рисунок крышки ложится на её плоскость: прямоугольник → параллелограмм. */
const LID_MATRIX = [
  WIDTH[0] / ART_WIDTH,
  WIDTH[1] / ART_WIDTH,
  DEPTH[0] / ART_HEIGHT,
  DEPTH[1] / ART_HEIGHT,
  A[0],
  A[1],
]
  .map((n) => n.toFixed(5))
  .join(",");

/** Затемнить цвет: торцы темнее крышки, тень грани — темнее торца. */
function shade(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(((value >> shift) & 0xff) * (1 - amount))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/**
 * Ключ, уникальный для палитры игры.
 *
 * Идентификаторы внутри SVG глобальны на весь документ, а на полке коробок
 * несколько: с постоянным `id` все они ссылались бы на определения первой.
 * Пока игра была одна, это не всплывало (src/games/chess/docs/BACKLOG.md A5).
 *
 * Считается из цветов, а не из `useId`: коробку рисует серверный компонент,
 * хуков там нет, а результат должен совпадать на сервере и в браузере.
 */
function paletteKey(colors: BoxColors): string {
  let hash = 0;
  for (const char of Object.values(colors).join("")) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36);
}

export interface BoxColors {
  /** Крышка. */
  lid: string;
  /** Торцы крышки. */
  side: string;
  /** Донце, видное из-под крышки. */
  base: string;
  /** Шов по нижней кромке крышки. */
  seam: string;
  /** Блик по верхним рёбрам. */
  rim: string;
}

export function BoxFrame({
  colors,
  className,
  children,
}: {
  colors: BoxColors;
  className?: string;
  /** Рисунок крышки в координатах 1000×620. */
  children: ReactNode;
}) {
  const key = paletteKey(colors);
  const shadowId = `box-shadow-${key}`;
  const lidId = `box-lid-${key}`;

  return (
    <svg
      viewBox="0 0 880 540"
      className={className}
      role="img"
      aria-hidden="true"
    >
      <defs>
        <filter id={shadowId} x="-30%" y="-30%" width="160%" height="190%">
          <feGaussianBlur stdDeviation="24" />
        </filter>
        {/*
          Рисунок обрезается краем крышки. Пока игры рисовали мелкий декор по
          углам, обрезка была не нужна; шахматы вывели на крышку строй фигур и
          доску до самого края — всё, что вышло за 1000×620, повисло призраком
          рядом с коробкой (src/games/chess/docs/BACKLOG.md A5).
        */}
        <clipPath id={lidId}>
          <rect x="0" y="0" width={ART_WIDTH} height={ART_HEIGHT} />
        </clipPath>
      </defs>

      <ellipse
        cx="446"
        cy={Cj[1] - 4}
        rx="298"
        ry="38"
        fill="rgba(8,3,18,0.5)"
        filter={`url(#${shadowId})`}
      />

      {/* Донце */}
      <polygon
        points={path([Di, Ci, Cj, Dj])}
        fill={shade(colors.base, 0.05)}
      />
      <polygon
        points={path([Ai, Di, Dj, Aj])}
        fill={shade(colors.base, 0.28)}
      />

      {/* Торцы крышки */}
      <polygon points={path([D, C, Cb, Db])} fill={shade(colors.side, 0.08)} />
      <polygon points={path([A, D, Db, Ab])} fill={shade(colors.side, 0.32)} />

      {/* Крышка с рисунком игры */}
      <g transform={`matrix(${LID_MATRIX})`} clipPath={`url(#${lidId})`}>
        <rect
          x="0"
          y="0"
          width={ART_WIDTH}
          height={ART_HEIGHT}
          fill={colors.lid}
        />
        {children}
      </g>

      {/* Шов: нижняя кромка крышки над донцем */}
      <polyline
        points={path([Ab, Db, Cb])}
        fill="none"
        stroke={colors.seam}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* Блик: картон ловит свет по верхним рёбрам */}
      <polyline
        points={path([A, B, C])}
        fill="none"
        stroke={colors.rim}
        strokeWidth="2"
        opacity="0.85"
      />
      <polyline
        points={path([A, D, C])}
        fill="none"
        stroke={colors.rim}
        strokeWidth="1.5"
        opacity="0.45"
      />
    </svg>
  );
}

import { BoxFrame, type BoxColors } from "@/components/games/BoxFrame";

/**
 * Коробка шахмат. Форму даёт платформа, отсюда — только цвета и рисунок
 * крышки (docs/BOX.md).
 *
 * Раскладка: армия стоит по нижнему краю, доска уходит вдаль, фраза держится
 * над строем без плашки. Плашка тут не годится — фраза длинная, и лента под
 * неё разрасталась во всю крышку, обкусывая декор.
 */

const COLORS: BoxColors = {
  lid: "#1d5c43",
  side: "#17513a",
  base: "#0f3527",
  seam: "#0a2419",
  rim: "#5fb08c",
};

/** Кремовый — кость фигур; латунь — часы и турнирные таблички. */
const LIGHT = "#f4ead6";
const BRASS = "#d9a441";
const DECOR = "rgba(255,255,255,0.26)";
const OVER = "rgba(255,255,255,0.78)";
const BADGE_SOFT = "rgba(255,255,255,0.18)";

/**
 * Силуэты фигур. Каждая нарисована в своём квадрате 100×100 и ставится на
 * место переносом и масштабом — так их можно строить в шеренгу, не пересчитывая
 * координаты вручную.
 */
const SHAPES: Record<string, string[]> = {
  pawn: [
    "M50 9 a15 15 0 1 1 -0.01 0 z",
    "M37 42 h26 l-5 12 c9 9 13 20 14 30 h-44 c1-10 5-21 14-30 z",
  ],
  knight: [
    "M30 92 C30 74 34 60 46 50 C52 45 54 40 53 34 L40 40 L34 28 " +
      "C42 20 52 14 60 11 C63 6 68 3 74 3 C84 8 90 20 91 34 " +
      "C92 52 90 72 86 92 Z",
  ],
  rook: [
    "M26 16 h11 v9 h9 v-9 h8 v9 h9 v-9 h11 v22 l-7 7 v26 l9 12 h-52 l9-12 " +
      "v-26 l-7-7 z",
  ],
  queen: [
    "M24 28 l10 32 h32 l10-32 -14 15 -8-23 -8 23 z",
    "M30 64 h40 c3 8 4 14 4 22 h-48 c0-8 1-14 4-22 z",
  ],
  king: [
    "M45 2 h10 v9 h9 v10 h-9 v12 h-10 v-12 h-9 v-10 h9 z",
    "M28 36 c8-4 36-4 44 0 c6 4 8 10 4 15 -3 4-8 6-12 7 " +
      "c7 7 11 16 12 28 h-52 c1-12 5-21 12-28 c-4-1-9-3-12-7 -4-5-2-11 4-15 z",
  ],
};

/** Подставка: у всех фигур одна и та же, иначе строй разъезжается по низу. */
const STAND = { x: 20, y: 86, width: 60, height: 10, rx: 4 };

function Piece({
  kind,
  x,
  y,
  scale,
  flip = false,
}: {
  kind: keyof typeof SHAPES | string;
  x: number;
  y: number;
  scale: number;
  /** Отражение по вертикали: фигура справа смотрит внутрь крышки. */
  flip?: boolean;
}) {
  const mirror = flip ? " translate(100 0) scale(-1 1)" : "";

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})${mirror}`} fill={DECOR}>
      {SHAPES[kind]?.map((d) => (
        <path key={d} d={d} />
      ))}
      <rect {...STAND} />
    </g>
  );
}

/**
 * Доска, уходящая вдаль: шесть рядов трапецией, чем ближе — тем шире и
 * плотнее. Даёт крышке глубину, которой не бывает у плоской заливки.
 */
function Board() {
  const rows = 6;
  const cols = 8;
  const [yFar, yNear] = [300, 650];
  const [wFar, wNear] = [430, 1260];
  const cells = [];

  for (let row = 0; row < rows; row++) {
    // Ряды сгущаются к горизонту — отсюда степень, а не ровное деление.
    const near = (t: number) => Math.pow(t, 1.35);
    const [t0, t1] = [near(row / rows), near((row + 1) / rows)];
    const [y0, y1] = [yFar + (yNear - yFar) * t0, yFar + (yNear - yFar) * t1];
    const [w0, w1] = [wFar + (wNear - wFar) * t0, wFar + (wNear - wFar) * t1];
    const opacity = 0.05 + (0.17 - 0.05) * t1;

    for (let col = 0; col < cols; col++) {
      if ((row + col) % 2) continue;
      const edge = (w: number, at: number) => 500 - w / 2 + (w * at) / cols;
      cells.push(
        <polygon
          key={`${row}-${col}`}
          points={
            `${edge(w0, col).toFixed(1)},${y0.toFixed(1)} ` +
            `${edge(w0, col + 1).toFixed(1)},${y0.toFixed(1)} ` +
            `${edge(w1, col + 1).toFixed(1)},${y1.toFixed(1)} ` +
            `${edge(w1, col).toFixed(1)},${y1.toFixed(1)}`
          }
          fill="#ffffff"
          opacity={opacity.toFixed(3)}
        />,
      );
    }
  }

  return <g>{cells}</g>;
}

/** Шеренга фигур. Строй разорван по центру — в просвет встают отметки. */
function Army({
  kinds,
  x,
  flip = false,
}: {
  kinds: string[];
  x: number;
  flip?: boolean;
}) {
  const scale = 1.36;
  const step = 100 * scale + 6;

  return (
    <>
      {kinds.map((kind, at) => (
        <Piece
          key={`${kind}-${at}`}
          kind={kind}
          x={x + at * step}
          y={398}
          scale={scale}
          flip={flip}
        />
      ))}
    </>
  );
}

/** Отметки: сколько игроков, с какого возраста, сколько идёт партия. */
const BADGES = [
  { value: "2", label: "игроков" },
  { value: "6+", label: "возраст" },
  { value: "5", label: "минут" },
];

export function ChessBox({ className }: { className?: string }) {
  return (
    <BoxFrame colors={COLORS} className={className}>
      <defs>
        {/* Свет сверху: без него сукно выглядит заливкой, а не картоном. */}
        <linearGradient id="chess-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.10" />
          <stop offset="52%" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.16" />
        </linearGradient>
        <radialGradient id="chess-shade" cx="50%" cy="42%" r="72%">
          <stop offset="55%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.30" />
        </radialGradient>
      </defs>

      <Board />
      <Army kinds={["pawn", "knight", "rook", "king"]} x={10} />
      <Army kinds={["queen", "rook", "knight", "pawn"]} x={418} flip />

      <rect x="0" y="0" width="1000" height="620" fill="url(#chess-glow)" />
      <rect x="0" y="0" width="1000" height="620" fill="url(#chess-shade)" />

      <text
        x="500"
        y="84"
        textAnchor="middle"
        fontSize="25"
        fontWeight="700"
        letterSpacing="6"
        fill={OVER}
      >
        игра для двоих
      </text>

      {/*
        Название одной строкой: «ШАХМАТЫ» — одно слово, и разрыв посреди него
        читается как оговорка. Два оттенка, которых требует docs/BOX.md,
        делят его по смыслу, не разрывая строки.
      */}
      <text
        x="500"
        y="208"
        textAnchor="middle"
        fontSize="116"
        fontWeight="900"
        letterSpacing="-2"
        fill={LIGHT}
      >
        ШАХ
        <tspan fill={BRASS}>МАТЫ</tspan>
      </text>

      <rect x="300" y="236" width="400" height="4" rx="2" fill={BRASS} />

      <text
        x="500"
        y="300"
        textAnchor="middle"
        fontSize="31"
        fontWeight="600"
        letterSpacing="1"
        fill={LIGHT}
      >
        Величайшая война в истории,
      </text>
      <text
        x="500"
        y="344"
        textAnchor="middle"
        fontSize="31"
        fontWeight="600"
        letterSpacing="1"
        fill={LIGHT}
      >
        запертая на 64 клетках
      </text>

      {BADGES.map(({ value, label }, at) => {
        const cx = 366 + at * 134;
        const middle = at === 1;

        return (
          <g key={label}>
            <circle
              cx={cx}
              cy="506"
              r="34"
              fill={middle ? LIGHT : BADGE_SOFT}
            />
            <text
              x={cx}
              y="517"
              textAnchor="middle"
              fontSize="26"
              fontWeight="800"
              fill={middle ? COLORS.lid : LIGHT}
            >
              {value}
            </text>
            <text
              x={cx}
              y="566"
              textAnchor="middle"
              fontSize="19"
              fontWeight="600"
              fill={OVER}
            >
              {label}
            </text>
          </g>
        );
      })}
    </BoxFrame>
  );
}

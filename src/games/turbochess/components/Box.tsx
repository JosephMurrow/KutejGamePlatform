import { BoxFrame, type BoxColors } from "@/components/games/BoxFrame";

/**
 * Коробка турбо-шахмат. Форму даёт платформа, отсюда — только цвета и рисунок
 * крышки (docs/BOX.md).
 *
 * Направление «Стикербомб», утверждено хозяином канвой из трёх вариантов:
 * огненно-оранжевая крышка, надписи вырезаны наклейками — в той же манере,
 * что аватары платформы: белая окантовка вырубки, тёмный контур, тень
 * (docs/DESIGN.md, «Аватары»). Декор — предметы режимов: кость загула,
 * радиация ядерных, стопка алко, корона королевской битвы, молния турбо,
 * череп зомби.
 */

const COLORS: BoxColors = {
  lid: "#ff5a1f",
  side: "#ee4d14",
  base: "#9c2c06",
  seam: "#7a2305",
  rim: "#ffb391",
};

/** Контур наклеек и тень под ними. */
const DARK = "#2b1206";
const YELLOW = "#ffe14a";
const DECOR = "rgba(255,255,255,0.24)";
const OVER = "rgba(255,255,255,0.86)";

const rad = (deg: number) => (deg * Math.PI) / 180;
const at = (r: number, deg: number) =>
  `${(50 + r * Math.cos(rad(deg))).toFixed(2)} ${(50 + r * Math.sin(rad(deg))).toFixed(2)}`;

/** Лопасть знака радиации — кольцевой сектор в шестьдесят градусов. */
function blade(deg: number) {
  const [inner, outer] = [16, 47];
  return (
    `M${at(inner, deg - 30)} L${at(outer, deg - 30)} ` +
    `A${outer} ${outer} 0 0 1 ${at(outer, deg + 30)} ` +
    `L${at(inner, deg + 30)} A${inner} ${inner} 0 0 0 ${at(inner, deg - 30)} Z`
  );
}

/** Дырка кругом — подпуть для заливки по правилу evenodd. */
const hole = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;

/**
 * Предметы режимов. Каждый нарисован в своём квадрате 100×100 и ставится на
 * место переносом, поворотом и масштабом.
 */
const DECOR_SHAPES = {
  die:
    "M26 12 H74 Q88 12 88 26 V74 Q88 88 74 88 H26 Q12 88 12 74 V26 Q12 12 26 12 Z " +
    [
      hole(32, 32, 7),
      hole(68, 32, 7),
      hole(50, 50, 7),
      hole(32, 68, 7),
      hole(68, 68, 7),
    ].join(" "),
  nuke: [blade(-150), blade(-30), blade(90), hole(50, 50, 10)].join(" "),
  shot: "M22 14 H78 L69 84 H31 Z M28 88 H72 V96 H28 Z M30 30 H70 L68 44 H32 Z",
  crown:
    "M12 80 L18 30 L36 54 L50 20 L64 54 L82 30 L88 80 Z M12 86 H88 V96 H12 Z",
  bolt: "M60 4 L20 56 H46 L36 96 L80 38 H54 Z",
  skull:
    "M50 6 C75 6 90 24 90 45 C90 57 84 66 75 70 V80 H25 V70 C16 66 10 57 10 45 " +
    "C10 24 25 6 50 6 Z M28 83 H72 V96 H28 Z " +
    [hole(34, 45, 11), hole(66, 45, 11)].join(" ") +
    " M50 56 L43 69 H57 Z M39 83 H43 V96 H39 Z M48 83 H52 V96 H48 Z M57 83 H61 V96 H57 Z",
} as const;

function Decor({
  kind,
  x,
  y,
  size,
  rotate = 0,
}: {
  kind: keyof typeof DECOR_SHAPES;
  x: number;
  y: number;
  size: number;
  rotate?: number;
}) {
  return (
    <g
      transform={`translate(${x} ${y}) rotate(${rotate} ${size / 2} ${size / 2}) scale(${size / 100})`}
    >
      <path d={DECOR_SHAPES[kind]} fill={DECOR} fillRule="evenodd" />
    </g>
  );
}

/**
 * Надпись-наклейка: четыре слоя одного текста. Снизу тень и белая окантовка
 * вырубки, над ней тёмный контур, сверху заливка. Толщина обводок — от кегля,
 * иначе у мелкой строки окантовка съела бы буквы.
 */
function Sticker({
  children,
  y,
  size,
  fill,
  rotate,
  spacing = -2,
}: {
  children: string;
  y: number;
  size: number;
  fill: string;
  rotate: number;
  spacing?: number;
}) {
  const text = {
    x: 0,
    y,
    textAnchor: "middle" as const,
    fontSize: size,
    fontWeight: 900,
    letterSpacing: spacing,
    strokeLinejoin: "round" as const,
  };

  return (
    <g transform={`translate(500 0) rotate(${rotate} 0 ${y - size / 3})`}>
      <text
        {...text}
        dx="6"
        dy="9"
        fill={DARK}
        stroke={DARK}
        strokeWidth={size * 0.3}
        opacity="0.35"
      >
        {children}
      </text>
      <text {...text} fill="#ffffff" stroke="#ffffff" strokeWidth={size * 0.3}>
        {children}
      </text>
      <text {...text} fill={DARK} stroke={DARK} strokeWidth={size * 0.14}>
        {children}
      </text>
      <text {...text} fill={fill}>
        {children}
      </text>
    </g>
  );
}

/** Отметки: сколько игроков, с какого возраста, сколько идёт партия. */
const BADGES = [
  { value: "2–4", label: "игроков" },
  { value: "18+", label: "возраст" },
  { value: "10", label: "минут" },
];

export function TurboChessBox({ className }: { className?: string }) {
  return (
    <BoxFrame colors={COLORS} className={className}>
      <defs>
        {/* Жар от центра: без него крышка — заливка, а не картон. */}
        <radialGradient id="turbochess-heat" cx="50%" cy="38%" r="75%">
          <stop offset="0%" stopColor="#ffd08a" stopOpacity="0.35" />
          <stop offset="60%" stopColor="#ff5a1f" stopOpacity="0" />
          <stop offset="100%" stopColor="#6a1a00" stopOpacity="0.28" />
        </radialGradient>
      </defs>

      <rect
        x="0"
        y="0"
        width="1000"
        height="620"
        fill="url(#turbochess-heat)"
      />

      <Decor kind="die" x={44} y={40} size={98} rotate={-14} />
      <Decor kind="nuke" x={860} y={44} size={100} />
      <Decor kind="shot" x={52} y={250} size={96} rotate={-8} />
      <Decor kind="crown" x={858} y={252} size={100} rotate={10} />
      <Decor kind="bolt" x={60} y={440} size={110} rotate={-6} />
      <Decor kind="skull" x={846} y={452} size={108} />

      <text
        x="500"
        y="78"
        textAnchor="middle"
        fontSize="24"
        fontWeight="700"
        letterSpacing="6"
        fill={OVER}
      >
        шахматы для взрослой компании
      </text>

      {/*
        Название в две строки: «ТУРБО / ШАХМАТЫ» на них делится по смыслу, и
        два оттенка, которых требует docs/BOX.md, — белая и жёлтая наклейки.
      */}
      <Sticker y={202} size={132} fill="#ffffff" rotate={-4}>
        ТУРБО
      </Sticker>
      <Sticker y={306} size={96} fill={YELLOW} rotate={2} spacing={0}>
        ШАХМАТЫ
      </Sticker>

      {/* Лента-наклейка со слоганом */}
      <g transform="rotate(-3 500 364)">
        <rect
          x="286"
          y="338"
          width="428"
          height="56"
          rx="6"
          fill={DARK}
          opacity="0.3"
          transform="translate(5 7)"
        />
        <rect x="286" y="338" width="428" height="56" rx="6" fill="#ffffff" />
        <text
          x="500"
          y="377"
          textAnchor="middle"
          fontSize="29"
          fontWeight="800"
          letterSpacing="1"
          fill={DARK}
        >
          ФИДЕ не одобряет
        </text>
      </g>

      {BADGES.map(({ value, label }, index) => {
        const cx = 366 + index * 134;
        const middle = index === 1;

        return (
          <g key={label}>
            <circle cx={cx + 3} cy="484" r="38" fill={DARK} opacity="0.3" />
            <circle cx={cx} cy="480" r="38" fill="#ffffff" />
            <circle cx={cx} cy="480" r="31" fill={middle ? DARK : COLORS.lid} />
            <text
              x={cx}
              y="491"
              textAnchor="middle"
              fontSize={value.length > 2 ? 23 : 28}
              fontWeight="900"
              fill={middle ? YELLOW : "#ffffff"}
            >
              {value}
            </text>
            <text
              x={cx}
              y="546"
              textAnchor="middle"
              fontSize="19"
              fontWeight="700"
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

import { BoxFrame, type BoxColors } from "@/components/games/BoxFrame";

/**
 * Коробка платитутки. Форму даёт платформа, отсюда — только цвета и рисунок
 * крышки (docs/BOX.md).
 */
const COLORS: BoxColors = {
  lid: "#d31450",
  side: "#c01047",
  base: "#8e0a34",
  seam: "#7a0a2c",
  rim: "#ff7aa8",
};

const PAPER = "rgba(255,255,255,0.16)";
const SOFT = "#ffd9e6";
const GOLD = "#ffb84d";

export function PricetituteBox({ className }: { className?: string }) {
  return (
    <BoxFrame colors={COLORS} className={className}>
      {/* Декор: деньги и неловкий вопрос — то, из чего игра и состоит */}
      <circle cx="120" cy="150" r="52" fill={PAPER} />
      <text
        x="120"
        y="172"
        textAnchor="middle"
        fontSize="52"
        fontWeight="800"
        fill={SOFT}
      >
        ₽
      </text>
      <g transform="rotate(-10 132 470)">
        <rect x="66" y="432" width="132" height="76" rx="11" fill={PAPER} />
        <circle
          cx="132"
          cy="470"
          r="21"
          fill="none"
          stroke={SOFT}
          strokeWidth="5"
        />
      </g>
      <circle cx="880" cy="152" r="58" fill={PAPER} />
      <text
        x="880"
        y="176"
        textAnchor="middle"
        fontSize="66"
        fontWeight="800"
        fill={SOFT}
      >
        ?
      </text>
      <g transform="rotate(9 872 468)">
        <rect x="800" y="430" width="144" height="78" rx="11" fill={PAPER} />
        <text
          x="872"
          y="482"
          textAnchor="middle"
          fontSize="34"
          fontWeight="800"
          fill={SOFT}
        >
          ₽₽₽
        </text>
      </g>
      <circle cx="250" cy="70" r="8" fill={SOFT} />
      <circle cx="760" cy="66" r="7" fill={GOLD} />
      <circle cx="236" cy="560" r="7" fill={GOLD} />
      <circle cx="768" cy="556" r="8" fill={SOFT} />

      {/* Надстрочник, вордмарк, лента, бейджи — обязательный порядок коробки */}
      <text
        x="500"
        y="104"
        textAnchor="middle"
        fontSize="30"
        fontWeight="700"
        fill="rgba(255,255,255,0.78)"
      >
        игра для взрослой компании
      </text>
      <text
        x="500"
        y="248"
        textAnchor="middle"
        fontSize="146"
        fontWeight="900"
        letterSpacing="-5"
        fill="#ffffff"
      >
        ПЛАТИ
      </text>
      <text
        x="500"
        y="378"
        textAnchor="middle"
        fontSize="146"
        fontWeight="900"
        letterSpacing="-5"
        fill={SOFT}
      >
        ТУТКА
      </text>

      <rect x="222" y="404" width="556" height="52" rx="6" fill="#ffffff" />
      <text
        x="500"
        y="440"
        textAnchor="middle"
        fontSize="28"
        fontWeight="700"
        fill="#8e0a34"
      >
        у каждого есть цена
      </text>

      <circle cx="366" cy="530" r="36" fill="rgba(255,255,255,0.2)" />
      <text
        x="366"
        y="542"
        textAnchor="middle"
        fontSize="28"
        fontWeight="800"
        fill="#ffffff"
      >
        2+
      </text>
      <text
        x="366"
        y="596"
        textAnchor="middle"
        fontSize="19"
        fontWeight="600"
        fill="rgba(255,255,255,0.78)"
      >
        игроков
      </text>

      <circle cx="500" cy="530" r="36" fill="#ffffff" />
      <text
        x="500"
        y="542"
        textAnchor="middle"
        fontSize="28"
        fontWeight="800"
        fill="#d31450"
      >
        18+
      </text>
      <text
        x="500"
        y="596"
        textAnchor="middle"
        fontSize="19"
        fontWeight="600"
        fill="rgba(255,255,255,0.78)"
      >
        возраст
      </text>

      <circle cx="634" cy="530" r="36" fill="rgba(255,255,255,0.2)" />
      <text
        x="634"
        y="542"
        textAnchor="middle"
        fontSize="26"
        fontWeight="800"
        fill="#ffffff"
      >
        6
      </text>
      <text
        x="634"
        y="596"
        textAnchor="middle"
        fontSize="19"
        fontWeight="600"
        fill="rgba(255,255,255,0.78)"
      >
        минут
      </text>
    </BoxFrame>
  );
}

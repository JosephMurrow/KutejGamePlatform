import { getAvatar, SPECIES_ANCHORS, type AvatarSpec } from "@/lib/avatars";
import { botAvatarPackFor, isBotAvatarId } from "@/lib/games/registry";

const OUTLINE = "#15151c";

export function Avatar({
  id,
  size = 48,
  className,
}: {
  id: number;
  size?: number;
  className?: string;
}) {
  // Служебный диапазон номеров — аватары ботов. Рисует их сама игра: платформа
  // спрашивает реестр и зовёт то, что он вернул (docs/BACKLOG.md D5).
  if (isBotAvatarId(id)) {
    const pack = botAvatarPackFor(id);
    if (pack) {
      return <pack.Render id={id} size={size} className={className} />;
    }
  }

  const spec = getAvatar(id);
  const anchors = SPECIES_ANCHORS[spec.species];

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="32" fill={spec.bg} />
      <Face spec={spec} />
      {spec.accessory === "cap" && (
        <Cap color={spec.accent} topY={anchors.topY} />
      )}
      {spec.accessory === "glasses" && (
        <Glasses
          color={spec.accent}
          eyeY={anchors.eyeY}
          eyeDx={anchors.eyeDx}
        />
      )}
      {spec.accessory === "bowtie" && <Bowtie color={spec.accent} />}
    </svg>
  );
}

function Face({ spec }: { spec: AvatarSpec }) {
  switch (spec.species) {
    case "cat":
      return <Cat spec={spec} />;
    case "dog":
      return <Dog spec={spec} />;
    case "hedgehog":
      return <Hedgehog spec={spec} />;
    case "lizard":
      return <Lizard spec={spec} />;
    case "fox":
      return <Fox spec={spec} />;
    case "frog":
      return <Frog spec={spec} />;
    case "owl":
      return <Owl spec={spec} />;
    case "raccoon":
      return <Raccoon spec={spec} />;
  }
}

function Cat({ spec }: { spec: AvatarSpec }) {
  return (
    <g stroke={OUTLINE} strokeLinejoin="round">
      <path d="M15 30 L17 9 L33 21 Z" fill={spec.shade} strokeWidth={2} />
      <path d="M49 30 L47 9 L31 21 Z" fill={spec.shade} strokeWidth={2} />
      <circle cx="32" cy="36" r="19" fill={spec.body} strokeWidth={2} />
      <circle cx="25" cy="34" r="3.4" fill={OUTLINE} strokeWidth={0} />
      <circle cx="39" cy="34" r="3.4" fill={OUTLINE} strokeWidth={0} />
      <circle cx="26.2" cy="32.8" r="1.1" fill="#fff" strokeWidth={0} />
      <circle cx="40.2" cy="32.8" r="1.1" fill="#fff" strokeWidth={0} />
      <path d="M28.5 41 L35.5 41 L32 45 Z" fill="#F2748F" strokeWidth={1.4} />
      <g strokeWidth={1.4} strokeLinecap="round" fill="none">
        <path d="M20 43 L11 41 M20 46 L11 48" />
        <path d="M44 43 L53 41 M44 46 L53 48" />
      </g>
    </g>
  );
}

function Dog({ spec }: { spec: AvatarSpec }) {
  return (
    <g stroke={OUTLINE} strokeLinejoin="round">
      <ellipse
        cx="13"
        cy="36"
        rx="6.5"
        ry="12"
        fill={spec.shade}
        strokeWidth={2}
      />
      <ellipse
        cx="51"
        cy="36"
        rx="6.5"
        ry="12"
        fill={spec.shade}
        strokeWidth={2}
      />
      <circle cx="32" cy="34" r="19" fill={spec.body} strokeWidth={2} />
      <ellipse
        cx="32"
        cy="44"
        rx="12"
        ry="8.5"
        fill={spec.belly}
        strokeWidth={1.8}
      />
      <circle cx="25" cy="32" r="3.2" fill={OUTLINE} strokeWidth={0} />
      <circle cx="39" cy="32" r="3.2" fill={OUTLINE} strokeWidth={0} />
      <circle cx="26.1" cy="30.9" r="1.1" fill="#fff" strokeWidth={0} />
      <circle cx="40.1" cy="30.9" r="1.1" fill="#fff" strokeWidth={0} />
      <ellipse cx="32" cy="41" rx="4" ry="3" fill={OUTLINE} strokeWidth={0} />
      <path
        d="M32 44 L32 46 M32 46 Q28 49.5 25.5 46 M32 46 Q36 49.5 38.5 46"
        fill="none"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </g>
  );
}

function Hedgehog({ spec }: { spec: AvatarSpec }) {
  return (
    <g stroke={OUTLINE} strokeLinejoin="round">
      <path
        d="M6 42 L10 22 L15 33 L19 13 L24 30 L29 10 L34 30 L39 13 L44 32 L49 21 L54 35 L58 42 Q32 52 6 42 Z"
        fill={spec.body}
        strokeWidth={2}
      />
      <ellipse
        cx="32"
        cy="44"
        rx="16"
        ry="13"
        fill={spec.belly}
        strokeWidth={2}
      />
      <circle cx="26" cy="42" r="3" fill={OUTLINE} strokeWidth={0} />
      <circle cx="38" cy="42" r="3" fill={OUTLINE} strokeWidth={0} />
      <circle cx="27" cy="41" r="1" fill="#fff" strokeWidth={0} />
      <circle cx="39" cy="41" r="1" fill="#fff" strokeWidth={0} />
      <ellipse
        cx="32"
        cy="51"
        rx="3.4"
        ry="2.8"
        fill={OUTLINE}
        strokeWidth={0}
      />
    </g>
  );
}

function Lizard({ spec }: { spec: AvatarSpec }) {
  return (
    <g stroke={OUTLINE} strokeLinejoin="round">
      <path
        d="M17 24 L20 15 L24 24 L28 13 L32 24 L36 13 L40 24 L44 15 L47 24 Z"
        fill={spec.shade}
        strokeWidth={1.8}
      />
      <ellipse
        cx="32"
        cy="38"
        rx="21"
        ry="17"
        fill={spec.body}
        strokeWidth={2}
      />
      <circle cx="22" cy="33" r="6.5" fill="#fff" strokeWidth={1.8} />
      <circle cx="42" cy="33" r="6.5" fill="#fff" strokeWidth={1.8} />
      <circle cx="22" cy="33" r="2.8" fill={OUTLINE} strokeWidth={0} />
      <circle cx="42" cy="33" r="2.8" fill={OUTLINE} strokeWidth={0} />
      <circle cx="29" cy="43" r="1.2" fill={OUTLINE} strokeWidth={0} />
      <circle cx="35" cy="43" r="1.2" fill={OUTLINE} strokeWidth={0} />
      <path
        d="M22 47 Q32 54 42 47"
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </g>
  );
}

function Fox({ spec }: { spec: AvatarSpec }) {
  return (
    <g stroke={OUTLINE} strokeLinejoin="round">
      <path d="M13 32 L15 8 L34 22 Z" fill={spec.body} strokeWidth={2} />
      <path d="M51 32 L49 8 L30 22 Z" fill={spec.body} strokeWidth={2} />
      <path d="M18 27 L19 14 L28 22 Z" fill={spec.shade} strokeWidth={0} />
      <path d="M46 27 L45 14 L36 22 Z" fill={spec.shade} strokeWidth={0} />
      <circle cx="32" cy="36" r="18" fill={spec.body} strokeWidth={2} />
      <path
        d="M32 31 Q45 39 32 52 Q19 39 32 31 Z"
        fill={spec.belly}
        strokeWidth={1.8}
      />
      <circle cx="24" cy="33" r="3.2" fill={OUTLINE} strokeWidth={0} />
      <circle cx="40" cy="33" r="3.2" fill={OUTLINE} strokeWidth={0} />
      <circle cx="25.1" cy="31.9" r="1.1" fill="#fff" strokeWidth={0} />
      <circle cx="41.1" cy="31.9" r="1.1" fill="#fff" strokeWidth={0} />
      <ellipse
        cx="32"
        cy="42"
        rx="3.6"
        ry="2.8"
        fill={OUTLINE}
        strokeWidth={0}
      />
    </g>
  );
}

function Frog({ spec }: { spec: AvatarSpec }) {
  return (
    <g stroke={OUTLINE} strokeLinejoin="round">
      <ellipse
        cx="32"
        cy="41"
        rx="21"
        ry="16"
        fill={spec.body}
        strokeWidth={2}
      />
      <circle cx="19" cy="23" r="9" fill={spec.body} strokeWidth={2} />
      <circle cx="45" cy="23" r="9" fill={spec.body} strokeWidth={2} />
      <circle cx="19" cy="23" r="5" fill="#fff" strokeWidth={1.5} />
      <circle cx="45" cy="23" r="5" fill="#fff" strokeWidth={1.5} />
      <circle cx="19" cy="23" r="2.3" fill={OUTLINE} strokeWidth={0} />
      <circle cx="45" cy="23" r="2.3" fill={OUTLINE} strokeWidth={0} />
      <circle cx="28" cy="34" r="1.3" fill={OUTLINE} strokeWidth={0} />
      <circle cx="36" cy="34" r="1.3" fill={OUTLINE} strokeWidth={0} />
      <path
        d="M15 42 Q32 54 49 42"
        fill="none"
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </g>
  );
}

function Owl({ spec }: { spec: AvatarSpec }) {
  return (
    <g stroke={OUTLINE} strokeLinejoin="round">
      <path d="M14 21 L16 8 L27 18 Z" fill={spec.shade} strokeWidth={1.8} />
      <path d="M50 21 L48 8 L37 18 Z" fill={spec.shade} strokeWidth={1.8} />
      <ellipse
        cx="32"
        cy="36"
        rx="20"
        ry="19"
        fill={spec.body}
        strokeWidth={2}
      />
      <circle cx="23" cy="33" r="9" fill={spec.belly} strokeWidth={1.8} />
      <circle cx="41" cy="33" r="9" fill={spec.belly} strokeWidth={1.8} />
      <circle cx="23" cy="33" r="4" fill={OUTLINE} strokeWidth={0} />
      <circle cx="41" cy="33" r="4" fill={OUTLINE} strokeWidth={0} />
      <circle cx="24.4" cy="31.6" r="1.3" fill="#fff" strokeWidth={0} />
      <circle cx="42.4" cy="31.6" r="1.3" fill="#fff" strokeWidth={0} />
      <path d="M32 40 L36.5 46 L27.5 46 Z" fill="#F2B441" strokeWidth={1.5} />
    </g>
  );
}

function Raccoon({ spec }: { spec: AvatarSpec }) {
  return (
    <g stroke={OUTLINE} strokeLinejoin="round">
      <circle cx="16" cy="20" r="6.5" fill={spec.shade} strokeWidth={1.8} />
      <circle cx="48" cy="20" r="6.5" fill={spec.shade} strokeWidth={1.8} />
      <circle cx="32" cy="35" r="19" fill={spec.body} strokeWidth={2} />
      <path
        d="M13 31 Q32 22 51 31 Q47 43 32 38 Q17 43 13 31 Z"
        fill="#3A3543"
        strokeWidth={1.6}
      />
      <circle cx="24" cy="32" r="3.6" fill="#fff" strokeWidth={0} />
      <circle cx="40" cy="32" r="3.6" fill="#fff" strokeWidth={0} />
      <circle cx="24" cy="32" r="1.8" fill={OUTLINE} strokeWidth={0} />
      <circle cx="40" cy="32" r="1.8" fill={OUTLINE} strokeWidth={0} />
      <ellipse
        cx="32"
        cy="46"
        rx="10"
        ry="7"
        fill={spec.belly}
        strokeWidth={1.6}
      />
      <ellipse
        cx="32"
        cy="43"
        rx="3.4"
        ry="2.6"
        fill={OUTLINE}
        strokeWidth={0}
      />
    </g>
  );
}

function Cap({ color, topY }: { color: string; topY: number }) {
  return (
    <g
      transform={`translate(0 ${topY - 14})`}
      stroke={OUTLINE}
      strokeWidth={2}
      strokeLinejoin="round"
    >
      <path d="M15 22 A17 17 0 0 1 49 22 Z" fill={color} />
      <rect x="12" y="20.5" width="40" height="5" rx="2.5" fill={color} />
      <circle cx="32" cy="6" r="2.6" fill={color} />
    </g>
  );
}

function Glasses({
  color,
  eyeY,
  eyeDx,
}: {
  color: string;
  eyeY: number;
  eyeDx: number;
}) {
  const radius = Math.min(7, eyeDx + 1);
  return (
    <g fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
      <circle cx={32 - eyeDx} cy={eyeY} r={radius} />
      <circle cx={32 + eyeDx} cy={eyeY} r={radius} />
      <path
        d={`M${32 - eyeDx + radius} ${eyeY} L${32 + eyeDx - radius} ${eyeY}`}
      />
    </g>
  );
}

function Bowtie({ color }: { color: string }) {
  return (
    <g
      transform="translate(32 53)"
      stroke={OUTLINE}
      strokeWidth={1.8}
      strokeLinejoin="round"
    >
      <path d="M0 0 L-9.5 -5 L-9.5 5 Z" fill={color} />
      <path d="M0 0 L9.5 -5 L9.5 5 Z" fill={color} />
      <circle r="2.8" fill={color} strokeWidth={1.6} />
    </g>
  );
}

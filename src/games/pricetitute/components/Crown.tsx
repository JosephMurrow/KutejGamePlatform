import {
  CROWN_TITLES,
  type CrownKind,
} from "@/games/pricetitute/engine/crowns";

/**
 * Корона рядом с ником. Мелкая: она метка, а не украшение, и не должна
 * перебивать сам ник. Титул различается цветом — золото, серебро, бронза —
 * и подписывается при наведении.
 */
export function Crown({
  kind,
  size = 13,
  className = "",
}: {
  kind: CrownKind;
  size?: number;
  className?: string;
}) {
  const title = CROWN_TITLES[kind];

  return (
    <svg
      viewBox="0 0 24 20"
      width={size}
      height={(size * 20) / 24}
      role="img"
      aria-label={title}
      className={`inline-block shrink-0 align-baseline ${className}`}
    >
      <title>{title}</title>
      <path
        d="M1.6 5.2 6.8 9.4 12 1.8l5.2 7.6 5.2-4.2-1.9 11H3.5z"
        fill={METAL[kind]}
        stroke="var(--color-deep)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const METAL: Record<CrownKind, string> = {
  alltime: "var(--color-gold)",
  week: "var(--color-silver)",
  room: "var(--color-bronze)",
};

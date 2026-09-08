/**
 * Аватары ботов платитутки. Живут у игры, а не у платформы: игры будут очень
 * разные, и робот отсюда в чужой игре окажется чужим (docs/BACKLOG.md D5).
 *
 * Платформа зовёт этот компонент через реестр игр и сама роботов не знает.
 */
import {
  getRobot,
  ROBOT_AVATAR_OFFSET,
  type RobotSpec,
} from "@/games/pricetitute/bots/avatars";

const OUTLINE = "#15151c";

export function BotAvatar({
  id,
  size,
  className,
}: {
  id: number;
  size: number;
  className?: string;
}) {
  const spec = getRobot(id - ROBOT_AVATAR_OFFSET);
  const hatted = spec.accessory === "cap" || spec.accessory === "tophat";

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
      <RobotBody spec={spec} withAntenna={!hatted} />
      {spec.accessory === "cap" && <RobotCap color={spec.accent} />}
      {spec.accessory === "tophat" && <RobotTopHat color={spec.accent} />}
      {spec.accessory === "glasses" && <RobotGlasses color={spec.accent} />}
    </svg>
  );
}

function RobotBody({
  spec,
  withAntenna,
}: {
  spec: RobotSpec;
  withAntenna: boolean;
}) {
  return (
    <g stroke={OUTLINE} strokeLinejoin="round">
      {withAntenna && (
        <>
          <path
            d="M32 16 L32 8"
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="32" cy="6" r="3" fill={spec.accent} strokeWidth={1.8} />
        </>
      )}

      <rect
        x="9"
        y="27"
        width="5"
        height="11"
        rx="2"
        fill={spec.shade}
        strokeWidth={1.8}
      />
      <rect
        x="50"
        y="27"
        width="5"
        height="11"
        rx="2"
        fill={spec.shade}
        strokeWidth={1.8}
      />

      <rect
        x="14"
        y="16"
        width="36"
        height="33"
        rx="9"
        fill={spec.body}
        strokeWidth={2}
      />
      <rect
        x="19"
        y="23"
        width="26"
        height="13"
        rx="5"
        fill={spec.screen}
        strokeWidth={1.8}
      />

      <circle cx="26" cy="29.5" r="3" fill="#fff" strokeWidth={0} />
      <circle cx="38" cy="29.5" r="3" fill="#fff" strokeWidth={0} />
      <circle cx="26.8" cy="28.9" r="1.2" fill={OUTLINE} strokeWidth={0} />
      <circle cx="38.8" cy="28.9" r="1.2" fill={OUTLINE} strokeWidth={0} />

      <rect
        x="24"
        y="40"
        width="16"
        height="5"
        rx="2"
        fill={spec.shade}
        strokeWidth={1.6}
      />
      <g strokeWidth={1.2} strokeLinecap="round">
        <path d="M29 40.5 L29 44.5" />
        <path d="M32 40.5 L32 44.5" />
        <path d="M35 40.5 L35 44.5" />
      </g>
    </g>
  );
}

function RobotCap({ color }: { color: string }) {
  return (
    <g stroke={OUTLINE} strokeWidth={2} strokeLinejoin="round">
      <path d="M16 17 A16 14 0 0 1 48 17 Z" fill={color} />
      <rect x="12" y="15.5" width="40" height="4.5" rx="2.2" fill={color} />
    </g>
  );
}

function RobotTopHat({ color }: { color: string }) {
  return (
    <g stroke={OUTLINE} strokeWidth={2} strokeLinejoin="round">
      <rect x="11" y="14" width="42" height="4.5" rx="2.2" fill={color} />
      <rect x="20" y="2" width="24" height="13" rx="2" fill={color} />
    </g>
  );
}

function RobotGlasses({ color }: { color: string }) {
  return (
    <g fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round">
      <circle cx="26" cy="29.5" r="6" />
      <circle cx="38" cy="29.5" r="6" />
      <path d="M32 29.5 L32 29.5" />
      <path d="M20 29.5 L15 27" />
      <path d="M44 29.5 L49 27" />
    </g>
  );
}

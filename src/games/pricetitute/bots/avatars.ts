/**
 * Аватары ботов: роботы в шляпах и очках. Лежат отдельно от звериного пула,
 * поэтому игрок себе такого не выберет — робот в комнате всегда бот.
 */

export type RobotAccessory = "none" | "cap" | "tophat" | "glasses";

export interface RobotSpec {
  /** Корпус. */
  body: string;
  /** Затемнённый оттенок: уши, рот. */
  shade: string;
  /** Экран под глазами. */
  screen: string;
  bg: string;
  accessory: RobotAccessory;
  accent: string;
}

/** Идентификаторы роботов начинаются отсюда, чтобы не пересечься со зверями. */
export const ROBOT_AVATAR_OFFSET = 1000;

export const ROBOTS: readonly RobotSpec[] = [
  {
    body: "#8C93A3",
    shade: "#6E7484",
    screen: "#2A2F3A",
    bg: "#EDF0F4",
    accessory: "none",
    accent: "#FF5C93",
  },
  {
    body: "#D8626F",
    shade: "#B04452",
    screen: "#3A1A20",
    bg: "#FCE9EC",
    accessory: "cap",
    accent: "#F4D35E",
  },
  {
    body: "#5FA8C9",
    shade: "#3F86A6",
    screen: "#152A33",
    bg: "#E4F1F7",
    accessory: "glasses",
    accent: "#2A2F3A",
  },
  {
    body: "#7BC98A",
    shade: "#57A366",
    screen: "#17301F",
    bg: "#E8F7EC",
    accessory: "tophat",
    accent: "#2A2F3A",
  },
  {
    body: "#C9A85F",
    shade: "#A6853F",
    screen: "#332A15",
    bg: "#F9F1E0",
    accessory: "none",
    accent: "#D8626F",
  },
  {
    body: "#9A7BC9",
    shade: "#7757A6",
    screen: "#241A33",
    bg: "#F0EAFA",
    accessory: "cap",
    accent: "#7BC98A",
  },
  {
    body: "#C97B9A",
    shade: "#A65777",
    screen: "#331A24",
    bg: "#FBEAF1",
    accessory: "glasses",
    accent: "#F4D35E",
  },
  {
    body: "#6E7A8C",
    shade: "#4F5A6B",
    screen: "#1A2029",
    bg: "#EBEFF4",
    accessory: "tophat",
    accent: "#5FA8C9",
  },
  {
    body: "#E08A4C",
    shade: "#B8682F",
    screen: "#331F12",
    bg: "#FCEFE2",
    accessory: "none",
    accent: "#5FA8C9",
  },
  {
    body: "#4FB8A8",
    shade: "#2F9688",
    screen: "#123029",
    bg: "#E2F5F1",
    accessory: "cap",
    accent: "#D8626F",
  },
  {
    body: "#A3A3A3",
    shade: "#7D7D7D",
    screen: "#242424",
    bg: "#F2F2F2",
    accessory: "glasses",
    accent: "#FF5C93",
  },
  {
    body: "#B0714F",
    shade: "#8C5537",
    screen: "#2B1A12",
    bg: "#F7EBE2",
    accessory: "tophat",
    accent: "#F4D35E",
  },
];

export const ROBOT_COUNT = ROBOTS.length;

export function getRobot(id: number): RobotSpec {
  const index = ((Math.trunc(id) % ROBOT_COUNT) + ROBOT_COUNT) % ROBOT_COUNT;
  const spec = ROBOTS[index];
  if (!spec) throw new Error(`Робот с индексом ${id} не найден`);
  return spec;
}

export function isRobotAvatar(avatarId: number): boolean {
  return avatarId >= ROBOT_AVATAR_OFFSET;
}

/** Аватар робота по порядковому номеру бота. */
export function robotAvatarId(index: number): number {
  return ROBOT_AVATAR_OFFSET + (index % ROBOT_COUNT);
}

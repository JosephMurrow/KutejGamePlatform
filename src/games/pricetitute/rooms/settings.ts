import type { KindCopy, RoomKind } from "@/shared/room-settings";

/**
 * Настройки партии платитутки: сколько идут фазы, кто ведёт, чем кончается.
 *
 * Раньше это лежало в общих настройках комнаты, но длительность ставок и
 * ротация ведущего — правила этой игры, а не свойство комнаты как таковой
 * (docs/BACKLOG.md A1).
 */

export interface Choice {
  value: number;
  label: string;
}

export const BETTING_CHOICES: readonly Choice[] = [
  // Полминуты — для комнаты с экраном: там партию гонит ведущий, а не таймер.
  { value: 30_000, label: "30 секунд" },
  { value: 60_000, label: "1 минута" },
  { value: 120_000, label: "2 минуты" },
  { value: 300_000, label: "5 минут" },
];

/**
 * Сколько показывать вскрышку. Большой компании тридцати секунд мало — список
 * ставок не успевают прочитать; вдвоём, наоборот, долго.
 */
export const REVEAL_CHOICES: readonly Choice[] = [
  { value: 5_000, label: "5 секунд" },
  { value: 10_000, label: "10 секунд" },
  { value: 30_000, label: "30 секунд" },
];

export const DEFAULT_REVEAL_MS = 30_000;

export const DEFAULT_BETTING_MS = 300_000;

/** Значение из формы. Всё, чего нет в списке, откатывается к умолчанию. */
export function parseRevealMs(value: unknown): number {
  const ms = Number(value);
  return REVEAL_CHOICES.some((choice) => choice.value === ms)
    ? ms
    : DEFAULT_REVEAL_MS;
}

const ROTATION_TO_DB: Record<HostRotation, HostRotationDb> = {
  circle: "CIRCLE",
  owner: "OWNER",
};

/**
 * Кто ведёт раунды.
 *
 * Круг ходов — правило общего зала, и для компании оно и есть игра. Но на
 * аудитории круг рассыпается: двести зрителей по шесть минут на раунд дают
 * свой ход раз в двадцать часов. Стримерская комната поэтому водит иначе.
 */
export const HOST_ROTATIONS = ["circle", "owner"] as const;

export type HostRotation = (typeof HOST_ROTATIONS)[number];

export type HostRotationDb = "CIRCLE" | "OWNER";

export function rotationDbValue(rotation: HostRotation): HostRotationDb {
  return ROTATION_TO_DB[rotation];
}

export function parseRotation(value: unknown): HostRotation {
  const found = HOST_ROTATIONS.find(
    (rotation) => rotation === value || ROTATION_TO_DB[rotation] === value,
  );
  return found ?? "circle";
}

export const ROTATION_COPY: Record<HostRotation, KindCopy> = {
  circle: {
    title: "По кругу",
    hint: "Ведущим становится каждый по очереди — как в общем зале.",
  },
  owner: {
    title: "Всегда я",
    hint: "Ведёшь только ты, остальные всё время угадывают. Для зала и для трансляции — единственный рабочий вариант: круг на толпе не доходит.",
  },
};

/** Что предложить по умолчанию. За столом водят по очереди, в эфире — хозяин. */
export function defaultRotation(kind: RoomKind): HostRotation {
  return kind === "stream" ? "owner" : "circle";
}

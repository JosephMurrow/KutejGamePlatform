import { prisma } from "@/lib/prisma";
import type { RoomKind } from "@/shared/room-settings";
import { dbValue, parseMode, type QuestionMode } from "../questions/modes";
import type { EndMode } from "../engine/room";
import {
  defaultRotation,
  parseRevealMs,
  parseRotation,
  rotationDbValue,
  type HostRotation,
} from "./settings";

/**
 * Настройки партии платитутки в комнате: чтение, запись и разбор формы.
 *
 * Лежат в схеме игры. Платформа их не видит и не хранит — она только просит
 * игру сохранить своё при создании комнаты и отдать при её подъёме
 * (docs/BACKLOG.md A4).
 */

export const MIN_BETTING_MS = 30_000;
export const MAX_BETTING_MS = 15 * 60 * 1000;
export const MAX_END_VALUE = 99;

export interface RoomSettings {
  bettingMs: number;
  /** Сколько показывать вскрышку. */
  revealMs: number;
  includeAdult: boolean;
  /** Каким набором паков играет комната. */
  mode: QuestionMode;
  /** Кто ведёт раунды. */
  hostRotation: HostRotation;
  endMode: EndMode;
  endValue: number | null;
}

const END_TO_DB = {
  endless: "ENDLESS",
  rounds: "ROUNDS",
  points: "POINTS",
} as const;

const END_FROM_DB = {
  ENDLESS: "endless",
  ROUNDS: "rounds",
  POINTS: "points",
} as const;

/**
 * Умолчания. Ими же отвечаем на комнату без сохранённых настроек: строка
 * могла не доехать, и вешать из-за этого партию незачем.
 */
export function defaultRoomSettings(kind: RoomKind): RoomSettings {
  return {
    bettingMs: 300_000,
    revealMs: 30_000,
    includeAdult: true,
    mode: "normal",
    hostRotation: defaultRotation(kind),
    endMode: "endless",
    endValue: null,
  };
}

/** Разобрать то, что прислала форма создания комнаты. */
export function normalizeRoomSettings(
  input: {
    bettingMs?: unknown;
    revealMs?: unknown;
    includeAdult?: unknown;
    mode?: unknown;
    hostRotation?: unknown;
    endMode?: unknown;
    endValue?: unknown;
  },
  kind: RoomKind,
): RoomSettings {
  const bettingMs = clamp(
    Number(input.bettingMs) || 300_000,
    MIN_BETTING_MS,
    MAX_BETTING_MS,
  );

  const endMode: EndMode =
    input.endMode === "rounds" || input.endMode === "points"
      ? input.endMode
      : "endless";

  const rawValue = Number(input.endValue);
  const endValue =
    endMode === "endless" || !Number.isFinite(rawValue)
      ? null
      : clamp(Math.trunc(rawValue), 1, MAX_END_VALUE);

  return {
    bettingMs,
    revealMs: parseRevealMs(input.revealMs),
    includeAdult: input.includeAdult !== false,
    mode: parseMode(input.mode),
    hostRotation:
      input.hostRotation === undefined
        ? defaultRotation(kind)
        : parseRotation(input.hostRotation),
    endMode,
    endValue,
  };
}

export async function saveRoomSettings(
  roomId: string,
  settings: RoomSettings,
): Promise<void> {
  const data = {
    bettingMs: settings.bettingMs,
    revealMs: settings.revealMs,
    includeAdult: settings.includeAdult,
    mode: dbValue(settings.mode),
    hostRotation: rotationDbValue(settings.hostRotation),
    endMode: END_TO_DB[settings.endMode],
    endValue: settings.endValue,
  };

  await prisma.roomSettings.upsert({
    where: { roomId },
    create: { roomId, ...data },
    update: data,
  });
}

export async function loadRoomSettings(
  roomId: string,
  kind: RoomKind,
): Promise<RoomSettings> {
  const row = await prisma.roomSettings.findUnique({ where: { roomId } });
  if (!row) return defaultRoomSettings(kind);

  return {
    bettingMs: row.bettingMs,
    revealMs: row.revealMs,
    includeAdult: row.includeAdult,
    mode: parseMode(row.mode),
    hostRotation: parseRotation(row.hostRotation),
    endMode: END_FROM_DB[row.endMode],
    endValue: row.endValue,
  };
}

export async function dropRoomSettings(roomId: string): Promise<void> {
  await prisma.roomSettings.deleteMany({ where: { roomId } });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

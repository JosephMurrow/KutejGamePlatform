import { prisma } from "@/lib/prisma";
import {
  defaultRoomSettings,
  readOptions,
  type TurboRoomSettings,
} from "./settings";

/**
 * Настройки партии в приватной комнате: чтение, запись и уборка.
 *
 * Лежат в схеме игры, а не колонками в platform.private_rooms: платформа не
 * знает, какие у игры настройки, и хранить их у себя не может
 * (docs/DATABASE.md).
 */

export async function saveRoomSettings(
  roomId: string,
  settings: TurboRoomSettings,
): Promise<void> {
  await prisma.turboRoomSettings.upsert({
    where: { roomId },
    create: { roomId, ...settings },
    update: settings,
  });
}

/**
 * Настройки комнаты. Строки может не быть — комнату могли завести до того, как
 * игра научилась их писать, — тогда играем умолчанием.
 */
export async function loadRoomSettings(
  roomId: string,
): Promise<TurboRoomSettings> {
  const row = await prisma.turboRoomSettings.findUnique({ where: { roomId } });
  if (!row) return defaultRoomSettings();

  return {
    mode: row.mode,
    timeControl: row.timeControl,
    options: readOptions(row.options),
  };
}

/** Комнату удалили: своя строка уходит вместе с ней. */
export async function dropRoomSettings(roomId: string): Promise<void> {
  await prisma.turboRoomSettings.deleteMany({ where: { roomId } });
}

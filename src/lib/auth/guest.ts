import { randomBytes } from "node:crypto";
import { checkNickname, normalizeNickname } from "@/shared/guest";
import { MAX_PLAYERS_LIMIT } from "@/shared/room-settings";
import { randomAvatarId } from "../avatars";
import { prisma } from "../prisma";

/**
 * Заведение гостя в базе. Границы ника и фильтр — в `src/shared/guest.ts`:
 * они нужны и браузерной форме, а сюда тянется Prisma.
 *
 * Гость устроен так же, как бот: строка в `User` с прочерком вместо хеша
 * пароля — модель обкатана, изобретать нечего. Привязан он к своей комнате и
 * умирает вместе с ней; сохранить его нельзя, и это решено.
 */

/**
 * Потолок гостей на комнату (docs/SECURITY.md, S-D3). Гости не удаляются,
 * пока жива комната, а зрители стрима приходят и уходят сотнями, поэтому
 * потолок — не число мест, а то же число, что верхняя граница лимита игроков:
 * больше за одним столом всё равно не бывает.
 */
export const MAX_GUESTS_PER_ROOM = MAX_PLAYERS_LIMIT;

/** Сколько гостей заведено в комнате — по ссылке и из чата Твича. */
export async function countGuestsIn(roomId: string): Promise<number> {
  return prisma.user.count({ where: { guestRoomId: roomId } });
}

export interface GuestProfile {
  id: string;
  nickname: string;
  avatarId: number;
}

export type GuestResult =
  { ok: false; reason: string } | { ok: true; guest: GuestProfile };

/**
 * Завести гостя в комнате.
 *
 * Ник уникален внутри комнаты, а не вообще: гость живёт в одной комнате, и
 * запрещать ему «Толю» из-за «Толи» в чужой стримерской было бы странно.
 */
export async function createGuest(
  roomId: string,
  raw: string,
): Promise<GuestResult> {
  const nickname = normalizeNickname(raw);
  const problem = checkNickname(nickname);
  if (problem) return { ok: false, reason: problem };

  const taken = await prisma.user.findFirst({
    where: {
      guestRoomId: roomId,
      nickname: { equals: nickname, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (taken) {
    return { ok: false, reason: "Такой ник в комнате уже занят" };
  }

  const avatarId = randomAvatarId();

  // Логин гостю нужен только затем, что он уникальный ключ в таблице: войти
  // под ним всё равно нельзя — пароля нет.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const guest = await prisma.user.create({
        data: {
          login: `guest_${randomBytes(9).toString("hex")}`,
          passwordHash: "-",
          nickname,
          avatarId,
          isGuest: true,
          guestRoomId: roomId,
          // Возраст гость подтверждает на том же экране, где вписывает ник.
          adultConfirmedAt: new Date(),
        },
        select: { id: true, nickname: true, avatarId: true },
      });

      return { ok: true, guest };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  return { ok: false, reason: "Не удалось завести гостя, попробуй ещё раз" };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

/**
 * Хозяин переименовывает гостя.
 *
 * Выгнать за похабный ник можно всегда, но это выкидывает человека из партии —
 * а он, может, ни в чём не виноват, кроме чувства юмора. Переименование
 * оставляет его за столом.
 */
export async function renameGuest(
  guestId: string,
  nickname: string,
): Promise<void> {
  await prisma.user.updateMany({
    where: { id: guestId, isGuest: true },
    data: { nickname: normalizeNickname(nickname) },
  });
}

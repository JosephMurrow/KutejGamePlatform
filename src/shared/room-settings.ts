/**
 * Варианты настроек приватной комнаты.
 *
 * Живут в `shared`, потому что нужны и форме создания в браузере, и разбору
 * присланного на сервере. Импорт из `lib/rooms/private.ts` утащил бы в
 * браузерный бандл Prisma.
 */

/**
 * Какого рода комната. Значения совпадают с `enum RoomKind` в схеме, только в
 * нижнем регистре: наружу, в формы и в адреса, идёт этот вид.
 */
export const ROOM_KINDS = ["private", "stream", "home"] as const;

export type RoomKind = (typeof ROOM_KINDS)[number];

export type RoomKindDb = "PRIVATE" | "STREAM" | "HOME";

const KIND_TO_DB: Record<RoomKind, RoomKindDb> = {
  private: "PRIVATE",
  stream: "STREAM",
  home: "HOME",
};

export function kindDbValue(kind: RoomKind): RoomKindDb {
  return KIND_TO_DB[kind];
}

/** Разбор рода комнаты: из формы и из базы приходит текст. */
export function parseKind(value: unknown): RoomKind {
  const found = ROOM_KINDS.find(
    (kind) => kind === value || KIND_TO_DB[kind] === value,
  );
  return found ?? "private";
}

/**
 * Есть ли у комнаты вид «экран». У обычной приватной его нет: там все смотрят
 * в свои телефоны, показывать общий экран некому и незачем.
 */
export function hasScreen(kind: RoomKind): boolean {
  return kind === "stream" || kind === "home";
}

/** Пускают ли в комнату гостем, без регистрации. Только в стримерскую. */
export function allowsGuests(kind: RoomKind): boolean {
  return kind === "stream";
}

export interface KindCopy {
  title: string;
  hint: string;
}

export const KIND_COPY: Record<RoomKind, KindCopy> = {
  private: {
    title: "Своя комната",
    hint: "Играете компанией по ссылке, каждый со своего экрана.",
  },
  stream: {
    title: "Стримерская",
    hint: "Код показываешь в эфире, зрители заходят без регистрации. Отдельная картинка для трансляции — без вопроса и без твоего ответа.",
  },
  home: {
    title: "Играем дома",
    hint: "Картинка на телевизор, все садятся с телефонов по QR-коду. Вход только по аккаунту.",
  },
};

/**
 * Границы лимита игроков. Меньше двоих играть не в кого, а верхняя граница —
 * не столько правило, сколько предупреждение: столько людей за одним столом мы
 * пока не проверяли.
 */
export const MIN_PLAYERS_LIMIT = 2;
export const MAX_PLAYERS_LIMIT = 500;

/** Длина кода комнаты. Нужна форме входа по коду. */
export const ROOM_CODE_LENGTH = 6;

/** Длина названия комнаты. Оно рисуется на экране, поэтому не роман. */
export const ROOM_TITLE_MAX = 40;

/** Название из формы. Пустое и пробельное превращается в его отсутствие. */
export function normalizeTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const title = value.trim().slice(0, ROOM_TITLE_MAX);
  return title === "" ? null : title;
}

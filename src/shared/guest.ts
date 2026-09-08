/**
 * Ник гостя: границы и фильтр.
 *
 * Живёт в `shared`, потому что нужен и форме входа в браузере, и проверке на
 * сервере. Импорт из `lib/auth/guest.ts` утащил бы в браузерный бандл Prisma —
 * ровно та же история, что с настройками комнаты.
 *
 * Гость — одноразовый профиль стримерской комнаты: зритель не пойдёт
 * регистрироваться ради одного раунда (см. src/games/pricetitute/docs/BACKLOG.md O3).
 */

export const GUEST_NICKNAME_MIN = 2;
export const GUEST_NICKNAME_MAX = 20;

/** Сколько живёт гостевая сессия. Дольше комнаты она всё равно не нужна. */
export const GUEST_SESSION_SECONDS = 60 * 60 * 12;

export interface GuestProfile {
  id: string;
  nickname: string;
  avatarId: number;
}

export type GuestError =
  { ok: false; reason: string } | { ok: true; guest: GuestProfile };

/**
 * Ник гостя виден залу, а на стриме — ещё и всему интернету. Отвечает за
 * содержимое экрана хозяин канала, поэтому фильтр грубый и намеренно
 * неполный: он отсекает ленивых, остальное ловится кнопкой «выгнать».
 */
const BANNED = [
  "хуй",
  "хуе",
  "пизд",
  "ебан",
  "ебат",
  "еблан",
  "бляд",
  "мудак",
  "гандон",
  "пидор",
  "пидар",
  "nigger",
  "гитлер",
  "админ",
  "модератор",
];

/**
 * Приведение к виду, на котором ищутся запрещённые куски: латиница, похожая на
 * кириллицу, и цифры вместо букв. Полного решения тут не бывает, и делать вид,
 * что бывает, не нужно.
 */
function flatten(nickname: string): string {
  const map: Record<string, string> = {
    // Латиница, похожая на кириллицу.
    a: "а",
    b: "б",
    c: "с",
    e: "е",
    h: "н",
    k: "к",
    m: "м",
    o: "о",
    p: "р",
    t: "т",
    x: "х",
    y: "у",
    // Цифры вместо букв.
    "0": "о",
    "1": "и",
    "3": "з",
    "4": "ч",
    "6": "б",
    // Похожие буквы схлопываем, иначе «хуй» и «ху1» пришлось бы вносить в
    // список по отдельности.
    й: "и",
    ё: "е",
  };

  return [...nickname.toLowerCase()]
    .map((letter) => map[letter] ?? letter)
    .filter((letter) => /[a-zа-яё]/.test(letter))
    .join("");
}

export function nicknameLooksBad(nickname: string): boolean {
  const flat = flatten(nickname);
  return BANNED.some((bad) => flat.includes(flatten(bad)));
}

/** Проверка ника без похода в базу: длина и фильтр. */
export function checkNickname(raw: string): string | null {
  const nickname = raw.trim();

  if (nickname.length < GUEST_NICKNAME_MIN) {
    return `Ник не короче ${GUEST_NICKNAME_MIN} символов`;
  }
  if (nickname.length > GUEST_NICKNAME_MAX) {
    return `Ник не длиннее ${GUEST_NICKNAME_MAX} символов`;
  }
  if (nicknameLooksBad(nickname)) {
    return "Такой ник не годится — его увидит весь зал";
  }

  return null;
}

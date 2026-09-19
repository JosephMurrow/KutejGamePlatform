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

/**
 * Ник в том виде, в каком он хранится: NFC и без пробелов по краям. Без NFC
 * «й» из двух кодовых точек и «й» из одной — разные ники, которые выглядят
 * одинаково.
 */
export function normalizeNickname(raw: string): string {
  return raw.normalize("NFC").trim();
}

/**
 * Невидимые и управляющие символы: нули ширины, смена направления текста,
 * управляющие коды, частные и неназначенные символы. Ими прячут мат от
 * фильтра, выдают себя за чужой ник и переворачивают строку в чужой вёрстке
 * (docs/SECURITY.md, S-B8).
 *
 * Исключение одно — U+200D (ZWJ): им склеиваются составные эмодзи, и спрятать
 * в нём ничего нельзя.
 */
const HIDDEN = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Cn}\p{Zl}\p{Zp}]/gu;

export function hasHiddenChars(nickname: string): boolean {
  return (nickname.match(HIDDEN) ?? []).some((char) => char !== "\u200d");
}

/**
 * Проверка ника без похода в базу: длина, невидимые символы и фильтр.
 *
 * Одна для всех — гостя, зрителя из Твича и игрока с аккаунтом
 * (docs/SECURITY.md, S-B8): ник видит весь зал, а на стриме — интернет.
 */
export function checkNickname(raw: string): string | null {
  const nickname = normalizeNickname(raw);

  if (nickname.length < GUEST_NICKNAME_MIN) {
    return `Ник не короче ${GUEST_NICKNAME_MIN} символов`;
  }
  if (nickname.length > GUEST_NICKNAME_MAX) {
    return `Ник не длиннее ${GUEST_NICKNAME_MAX} символов`;
  }
  if (hasHiddenChars(nickname)) {
    return "В нике невидимые или служебные символы — убери их";
  }
  if (nicknameLooksBad(nickname)) {
    return "Такой ник не годится — его увидит весь зал";
  }

  return null;
}

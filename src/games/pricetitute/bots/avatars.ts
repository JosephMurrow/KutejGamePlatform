/**
 * Аватары ботов платитутки: двенадцать роботов, файлами в
 * `public/games/pricetitute/bots`.
 *
 * Лежат у игры, а не у платформы: игры будут очень разные, и робот отсюда в
 * игре про рисование окажется чужим. Платформа держит за игрой поддиапазон
 * служебных номеров и спрашивает адрес картинки через реестр
 * (docs/BACKLOG.md D5).
 *
 * Служебный номер человеку недоступен: робота себе не выберешь.
 */

/** Идентификаторы роботов начинаются отсюда, чтобы не пересечься со зверями. */
export const ROBOT_AVATAR_OFFSET = 1000;

export const ROBOT_COUNT = 12;

const DIR = "/games/pricetitute/bots";

/** Адрес картинки робота по служебному номеру аватара. */
export function robotAvatarSrc(avatarId: number): string {
  const index = avatarId - ROBOT_AVATAR_OFFSET;
  const safe = ((Math.trunc(index) % ROBOT_COUNT) + ROBOT_COUNT) % ROBOT_COUNT;
  return `${DIR}/${String(safe).padStart(2, "0")}.svg`;
}

/** Аватар робота по порядковому номеру бота. */
export function robotAvatarId(index: number): number {
  return ROBOT_AVATAR_OFFSET + (index % ROBOT_COUNT);
}

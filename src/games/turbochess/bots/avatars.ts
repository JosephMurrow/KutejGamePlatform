/**
 * Служебные номера аватаров ботов турбо-шахмат.
 *
 * У платитутки занято 1000–1011, шахматы держат с 1100; турбо-шахматы берут с
 * 1200, между наборами оставлен зазор на рост соседей.
 *
 * Подход взят у платитутки (решено хозяином, [BOTS.md](../docs/BOTS.md), А9): у
 * каждого бота своё лицо файлом в `public/games/turbochess/bots/NN.svg`, номер
 * служебный и человеку недоступен — лицо себе не выберешь. Значит лиц ровно
 * столько, сколько характеров: одиннадцать, по лицу на характер.
 */

/** Первый номер, отданный турбо-шахматам. */
export const BOT_AVATAR_OFFSET = 1200;

/**
 * Одиннадцать лиц — по лицу на характер, и номер у лица от характера, а не от
 * места за столом: Пьянчуга всегда нулевой, Дед всегда десятый.
 *
 * Манера «лицо» выбрана хозяином из двух показанных на канве (правило D0):
 * глаза прямо на голове, без забрала — характер виден во взгляде, а не только в
 * шапке.
 */
export const BOT_COUNT = 11;

const DIR = "/games/turbochess/bots";

/** Адрес картинки бота по служебному номеру аватара. */
export function botAvatarSrc(avatarId: number): string {
  const index = Math.max(0, avatarId - BOT_AVATAR_OFFSET);
  const safe = BOT_COUNT > 0 ? index % BOT_COUNT : index;
  return `${DIR}/${String(safe).padStart(2, "0")}.svg`;
}

/** Служебный номер аватара по порядковому номеру бота за столом. */
export function botAvatarId(index: number): number {
  const safe = BOT_COUNT > 0 ? index % BOT_COUNT : index;
  return BOT_AVATAR_OFFSET + Math.max(0, safe);
}

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
 * Лиц пока нет.
 *
 * Характеры известны (этап 13), а рисунки — блокирующий шаг: ничего не рисуем в
 * коде, пока хозяин не одобрил канву (docs/DESIGN.md, правило D0). Лицо рисуется
 * под характер, поэтому канва идёт после того, как характеры описаны, и до
 * того, как бот сядет за стол. Ноль означает, что платформа за картинкой не
 * пойдёт.
 */
export const BOT_COUNT = 0;

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

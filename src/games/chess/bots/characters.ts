import type { Character } from "./moments";

/**
 * Характеры ботов: чем один отличается от другого, кроме реплик.
 *
 * Характер не зависит от уровня: педант бывает слабым, быдло — сильным. Уровень
 * задаёт силу, характер — манеру и голос (src/games/chess/docs/BACKLOG.md D4).
 *
 * Манера задана надбавками к оценке хода, а не правкой движка: из ходов, между
 * которыми движку почти всё равно, характер выбирает свой. Надбавка применяется
 * только внутри узкого коридора от лучшего хода — иначе манера превратилась бы
 * в зевок (см. `style.ts`).
 */

/** Что характер любит в ходе. Сотые доли пешки, как и оценки движка. */
export interface Style {
  /** Взятие: разменять, съесть, упростить. */
  capture: number;
  /** Шах: погонять короля, даже когда это ничего не даёт. */
  check: number;
  /** Превращение пешки. */
  promotion: number;
  /** Рокировка: убрать короля вовремя. */
  castle: number;
}

export interface CharacterTraits {
  id: Character;
  /** Как характер называется в интерфейсе и в документации. */
  title: string;
  /** Ники, под которыми он садится за доску. */
  nicknames: string[];
  style: Style;
  /**
   * Насколько характер тороплив: множитель к паузе перед ходом.
   *
   * Единица — обычная задержка. Быдло рубит сплеча, дед сидит над каждым
   * ходом, и по одной только скорости их уже можно различить.
   */
  tempo: number;
}

export const CHARACTER_TRAITS: Record<Character, CharacterTraits> = {
  /** Педант: рокировка вовремя, никакой погони за шахами. */
  pedant: {
    id: "pedant",
    title: "Педант",
    nicknames: [
      "Аркадий Львович",
      "Разрядник",
      "Теоретик",
      "Кандидат в мастера",
    ],
    style: { capture: 0, check: -15, promotion: 20, castle: 45 },
    tempo: 1.15,
  },

  /** Быдло: съесть и объявить шах — два лучших хода в любой позиции. */
  brute: {
    id: "brute",
    title: "Быдло",
    nicknames: ["Санёк", "Толян", "Дрон", "Витёк"],
    style: { capture: 45, check: 35, promotion: 25, castle: -25 },
    tempo: 0.6,
  },

  /** Дед: размены, порядок, спокойное окончание. */
  granddad: {
    id: "granddad",
    title: "Дед",
    nicknames: ["Дед Николай", "Петрович", "Иваныч", "Михалыч"],
    style: { capture: 30, check: -10, promotion: 20, castle: 25 },
    tempo: 1.4,
  },

  /**
   * Чемпион: никаких надбавок вовсе. Его манера — играть лучший ход, и это
   * заметно не хуже любой прихоти.
   */
  champion: {
    id: "champion",
    title: "Чемпион",
    nicknames: ["Гроссмейстер", "Чемпион", "Мастер спорта", "Первая доска"],
    style: { capture: 0, check: 0, promotion: 0, castle: 0 },
    tempo: 0.9,
  },
};

/** Есть ли у характера прихоти: без них незачем просить у движка варианты. */
export function hasStyle(character: Character): boolean {
  const style = CHARACTER_TRAITS[character].style;
  return Object.values(style).some((weight) => weight !== 0);
}

/** Ник для этой партии. Случайный из своих: одинаковых ботов подряд не будет. */
export function nicknameOf(
  character: Character,
  random: () => number = Math.random,
): string {
  const names = CHARACTER_TRAITS[character].nicknames;
  return names[Math.floor(random() * names.length)] ?? names[0]!;
}

/**
 * Характеры ботов: одиннадцать персонажей, описанных хозяином.
 *
 * Своих здесь нет и быть не может: характеры описывает хозяин, а не агент, —
 * это то же правило, что D0 для рисунков, только про текст
 * ([BOTS.md](../docs/BOTS.md), А3). Моё в этом файле — ники (хозяин сказал
 * «придумай») и числа манеры: перевод сказанного словами в надбавки к оценке.
 *
 * Характер не зависит от уровня: Пьянчуга бывает Экспертом, Великий стратег —
 * Лёгким. Уровень задаёт силу, характер — выбор между ходами, которые перебору
 * почти безразличны, и голос.
 */

export type Character =
  | "drunk"
  | "butcher"
  | "genius"
  | "strategist"
  | "pilot"
  | "physicist"
  | "coder"
  | "sweetie"
  | "dwarf"
  | "hookah"
  | "granddad";

/**
 * Что характер любит в ходе. Сотые доли пешки — та же шкала, что у оценки.
 *
 * Надбавка работает только внутри коридора от лучшего хода (`style.ts`),
 * поэтому «любит» здесь значит «предпочтёт при прочих равных», а не «отдаст за
 * это фигуру».
 */
export interface Style {
  /** Взятие: срубить, разменять, упростить. */
  capture: number;
  /** Шах: погонять короля, даже когда это ничего не даёт. */
  check: number;
  /** Превращение пешки. */
  promotion: number;
  /** Рокировка: увести короля вовремя. */
  castle: number;
  /** Выставление из резерва или подкрепления — ход с полки. */
  drop: number;
  /** Продвижение к чужому краю. */
  advance: number;
  /** Отход назад, к своему краю. */
  retreat: number;
  /** Уход на край доски. */
  edge: number;
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
   * Дед торопится домой, кальянный мастер не спешит никуда — по одной только
   * скорости их уже можно различить, не читая чат.
   */
  tempo: number;
  /**
   * Надбавка к вероятности зевка поверх уровня: кто ошибается характером, а не
   * силой.
   */
  sloppy: number;
  /**
   * Насколько характер сдаёт к концу партии: надбавка к зевку за каждые
   * двадцать полуходов. Сбитый лётчик был сильным когда-то.
   */
  fade: number;
  /**
   * Как охотно жмёт кнопки режима: ноль — берёт до последнего, единица — жмёт
   * при первой возможности. Работает на подэтапе 13в, числа живут здесь, чтобы
   * характер был описан в одном месте.
   */
  nerve: number;
  /**
   * Как быстро портится игра от выпитого в алко-шахматах: множитель к
   * деградации (решено хозяином — чем больше выпил, тем хуже играет).
   */
  drunkard: number;
}

export const CHARACTER_TRAITS: Record<Character, CharacterTraits> = {
  /** Пьянчуга: «Ща, ща… я вижу комбинацию…» — рубит на авось и зевает. */
  drunk: {
    id: "drunk",
    title: "Пьянчуга",
    nicknames: ["Семёныч", "Три Звезды", "Дядя Вова"],
    style: {
      capture: 25,
      check: 10,
      promotion: 0,
      castle: -10,
      drop: 0,
      advance: 5,
      retreat: 0,
      edge: 0,
    },
    tempo: 1.4,
    sloppy: 0.15,
    fade: 0,
    nerve: 0.8,
    drunkard: 1.6,
  },

  /** Кровожадный: «Мне не нужен твой ферзь. Мне нужен твой король.» */
  butcher: {
    id: "butcher",
    title: "Кровожадный",
    nicknames: ["Мясник", "Кость", "Потрошитель"],
    style: {
      capture: 45,
      check: 35,
      promotion: 10,
      castle: -25,
      drop: 10,
      advance: 15,
      retreat: -20,
      edge: -10,
    },
    tempo: 0.85,
    sloppy: 0.05,
    fade: 0,
    nerve: 0.95,
    drunkard: 1,
  },

  /** Непонятный гений: «Ты этого не поймёшь.» — из равных берёт странное. */
  genius: {
    id: "genius",
    title: "Непонятный гений",
    nicknames: ["Загадка", "Шахматный Дали", "Ход Сорок Семь"],
    style: {
      capture: -10,
      check: -15,
      promotion: 0,
      castle: 0,
      drop: 15,
      advance: 0,
      retreat: 25,
      edge: 20,
    },
    tempo: 1.2,
    sloppy: 0,
    fade: 0,
    nerve: 0.5,
    drunkard: 0.8,
  },

  /** Великий стратег: «Материал — временное понятие.» */
  strategist: {
    id: "strategist",
    title: "Великий стратег",
    nicknames: ["Маршал", "Карта и Циркуль", "Тактик Иваныч"],
    style: {
      capture: -15,
      check: -20,
      promotion: 15,
      castle: 45,
      drop: -5,
      advance: 0,
      retreat: 5,
      edge: -15,
    },
    tempo: 1.35,
    sloppy: 0,
    fade: 0,
    nerve: 0.35,
    drunkard: 0.7,
  },

  /** Сбитый лётчик: «Раньше я таких, как ты, за завтраком ел.» */
  pilot: {
    id: "pilot",
    title: "Сбитый лётчик",
    nicknames: ["Командир", "Ас", "Бывший Разрядник"],
    style: {
      capture: 10,
      check: 5,
      promotion: 5,
      castle: 20,
      drop: 0,
      advance: 5,
      retreat: 0,
      edge: 0,
    },
    tempo: 1.1,
    sloppy: 0,
    fade: 0.05,
    nerve: 0.5,
    drunkard: 1.3,
  },

  /** Физик-ядерщик: «Это не ошибка, это эксперимент.» */
  physicist: {
    id: "physicist",
    title: "Физик-ядерщик",
    nicknames: ["Кандидат Наук", "Реактор", "Лаборант"],
    style: {
      capture: 20,
      check: 0,
      promotion: 5,
      castle: 10,
      drop: 0,
      advance: 0,
      retreat: 0,
      edge: -5,
    },
    tempo: 1.25,
    sloppy: 0,
    fade: 0,
    nerve: 0.7,
    drunkard: 0.5,
  },

  /** Айтишник-вайбкодер: «Работает — не трогай.» */
  coder: {
    id: "coder",
    title: "Айтишник-вайбкодер",
    nicknames: ["Сеньор", "Деплой в Пятницу", "Контрол-Зет"],
    style: {
      capture: 15,
      check: 10,
      promotion: 0,
      castle: 5,
      drop: 20,
      advance: 10,
      retreat: -10,
      edge: 0,
    },
    tempo: 0.7,
    sloppy: 0.05,
    fade: 0,
    nerve: 0.85,
    drunkard: 1.1,
  },

  /** Девочка-припевочка: «Ой, а я случайно ферзя съела.» */
  sweetie: {
    id: "sweetie",
    title: "Девочка-припевочка",
    nicknames: ["Лизонька", "Бантик", "Уточка"],
    style: {
      capture: 30,
      check: 0,
      promotion: 20,
      castle: 0,
      drop: 5,
      advance: 10,
      retreat: -5,
      edge: 0,
    },
    tempo: 0.9,
    sloppy: 0.1,
    fade: 0,
    nerve: 0.6,
    drunkard: 1.2,
  },

  /** Исполинский карлик: «РОСТ — ЭТО ВРЕМЕННО.» */
  dwarf: {
    id: "dwarf",
    title: "Исполинский карлик",
    nicknames: ["Малой", "Гном-Гигант", "Полтора Метра"],
    style: {
      capture: 10,
      check: 15,
      promotion: 40,
      castle: -10,
      drop: 10,
      advance: 30,
      retreat: -30,
      edge: 0,
    },
    tempo: 1,
    sloppy: 0.05,
    fade: 0,
    nerve: 0.8,
    drunkard: 1,
  },

  /** Кальянный мастер: «Брат, не спеши…» */
  hookah: {
    id: "hookah",
    title: "Кальянный мастер",
    nicknames: ["Брат", "Чаша", "Угли"],
    style: {
      capture: -20,
      check: -10,
      promotion: 5,
      castle: 15,
      drop: -5,
      advance: -10,
      retreat: 10,
      edge: 0,
    },
    tempo: 1.6,
    sloppy: 0,
    fade: 0,
    nerve: 0.25,
    drunkard: 0.9,
  },

  /** Уставший от бабки дед: «Мне ещё картошку чистить.» */
  granddad: {
    id: "granddad",
    title: "Уставший от бабки дед",
    nicknames: ["Дед", "Картошка Ждёт", "Пять Минут и Домой"],
    style: {
      capture: 35,
      check: 25,
      promotion: 10,
      castle: 0,
      drop: 5,
      advance: 15,
      retreat: -15,
      edge: 0,
    },
    tempo: 0.55,
    sloppy: 0.05,
    fade: 0.02,
    nerve: 0.9,
    drunkard: 1.4,
  },
};

export const CHARACTERS: readonly Character[] = [
  "drunk",
  "butcher",
  "genius",
  "strategist",
  "pilot",
  "physicist",
  "coder",
  "sweetie",
  "dwarf",
  "hookah",
  "granddad",
];

/** Характер по имени; незнакомое имя — не падение, а Пьянчуга. */
export function characterOf(id: unknown): CharacterTraits {
  return typeof id === "string" && id in CHARACTER_TRAITS
    ? CHARACTER_TRAITS[id as Character]
    : CHARACTER_TRAITS.drunk;
}

/** Ник характера по броску. */
export function nicknameOf(character: Character, roll: number): string {
  const { nicknames, title } = CHARACTER_TRAITS[character];
  const at = Math.min(
    nicknames.length - 1,
    Math.floor(roll * nicknames.length),
  );
  return nicknames[at] ?? title;
}

/**
 * Кто сядет за стол: характеры по броску, все разные.
 *
 * Разные — потому что в королевской битве уровень у ботов один, и отличать их
 * будут только характеры: трое одинаковых за столом это скучно
 * ([BOTS.md](../docs/BOTS.md), А8).
 */
export function drawCharacters(count: number, roll: () => number): Character[] {
  const bag = [...CHARACTERS];
  const drawn: Character[] = [];

  for (let taken = 0; taken < count && bag.length > 0; taken++) {
    const at = Math.min(bag.length - 1, Math.floor(roll() * bag.length));
    drawn.push(...bag.splice(at, 1));
  }

  return drawn;
}

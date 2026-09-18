/**
 * Каталог режимов: код, номер, название, правила одной строкой и сколько мест
 * за столом.
 *
 * Полные правила — в docs/MODES.md, здесь только то, что нужно форме комнаты,
 * главной странице игры и самой комнате. Файл без серверных зависимостей: его
 * читают и браузер, и движок.
 */

/**
 * Код режима, как он лежит в базе. Свой тип, а не импорт из сгенерированного
 * клиента Prisma: игра не должна зависеть от того, что и когда тот
 * сгенерировал, — так же сделано у шахмат.
 */
export type TurboMode =
  | "ONE_KIND"
  | "REINFORCEMENTS"
  | "ANNIHILATION"
  | "MEGA"
  | "BOOZE"
  | "NO_RETREAT"
  | "LAST_CHANCE"
  | "NUCLEAR"
  | "BATTLE_ROYALE"
  | "DOUBLE_AGENT"
  | "GIVEAWAY"
  | "BINGE"
  | "BLACK_MARKET"
  | "ZOMBIE"
  | "ANARCHY"
  | "SHOWDOWN"
  | "CLASSIC";

export interface ModeInfo {
  id: TurboMode;
  /**
   * Номер из docs/MODES.md. Постоянный: по номерам на режимы ссылаются план и
   * разговор с хозяином, поэтому новые режимы дописываются в конец.
   */
  number: number;
  title: string;
  /** Правила одной строкой — для формы комнаты и главной страницы. */
  short: string;
  /** Мест за столом. Всюду двое, в королевской битве — четверо. */
  seats: number;
  /**
   * Служебный режим: игрокам не показывается и формой не выбирается. Такой
   * один — «Классика» (docs/PLAN.md, этап 5).
   */
  hidden?: boolean;
}

export const MODES: readonly ModeInfo[] = [
  {
    id: "ONE_KIND",
    number: 1,
    title: "Одним видом фигур",
    short: "Все фигуры, кроме короля, — ферзи, ладьи, кони, слоны или пешки.",
    seats: 2,
  },
  {
    id: "REINFORCEMENTS",
    number: 2,
    title: "Подкрепление",
    short: "По ходу партии выводишь по одной лишней фигуре каждого вида.",
    seats: 2,
  },
  {
    id: "ANNIHILATION",
    number: 3,
    title: "На уничтожение",
    short: "Мата нет: побеждает тот, кто снимет с доски всё.",
    seats: 2,
  },
  {
    id: "MEGA",
    number: 4,
    title: "Мега-шахматы",
    short: "Дошёл до последней горизонтали — фигура получает суперсилу.",
    seats: 2,
  },
  {
    id: "BOOZE",
    number: 5,
    title: "Алко-шахматы",
    short: "Срубили фигуру — пьёшь стопку. Не выпил — теряешь ещё одну.",
    seats: 2,
  },
  {
    id: "NO_RETREAT",
    number: 6,
    title: "Пацанские шахматы",
    short: "Только вперёд и вбок. Назад дороги нет.",
    seats: 2,
  },
  {
    id: "LAST_CHANCE",
    number: 7,
    title: "Последний шанс",
    short: "При шахе король может прыгнуть в случайную клетку. Один раз.",
    seats: 2,
  },
  {
    id: "NUCLEAR",
    number: 8,
    title: "Ядерные шахматы",
    short: "Набил очков взятиями — сбрасывай бомбу и забирай партию.",
    seats: 2,
  },
  {
    id: "BATTLE_ROYALE",
    number: 9,
    title: "Королевская битва",
    short: "Доска 16×16, четверо за столом, все против всех.",
    seats: 4,
  },
  {
    id: "DOUBLE_AGENT",
    number: 10,
    title: "Двойной агент",
    short: "Одна твоя фигура тайно работает на соперника.",
    seats: 2,
  },
  {
    id: "GIVEAWAY",
    number: 11,
    title: "Поддавки",
    short: "Цель — скормить сопернику своего короля. Брать обязательно.",
    seats: 2,
  },
  {
    id: "BINGE",
    number: 12,
    title: "Загул",
    short: "Каждое взятие тянет случайное событие, и каждое — один раз.",
    seats: 2,
  },
  {
    id: "BLACK_MARKET",
    number: 13,
    title: "Чёрный рынок",
    short: "Очки за взятия тратишь в магазине: щит, лишний ход, воскрешение.",
    seats: 2,
  },
  {
    id: "ZOMBIE",
    number: 14,
    title: "Зомби-шахматы",
    short: "Срубленная фигура через три хода встаёт за того, кто её срубил.",
    seats: 2,
  },
  {
    id: "ANARCHY",
    number: 15,
    title: "Анархия в Соединённом Королевстве",
    short: "Большая красная кнопка «НЕТ»: четыре отмены чужого хода за партию.",
    seats: 2,
  },
  {
    id: "SHOWDOWN",
    number: 16,
    title: "Вскрываемся",
    short: "Расставляешь фигуры вслепую, вскрываетесь одновременно.",
    seats: 2,
  },
  {
    // Номер ноль: у служебного режима места в нумерации MODES.md нет.
    id: "CLASSIC",
    number: 0,
    title: "Классика",
    short: "Обычные шахматы — служебный режим для проверок.",
    seats: 2,
    hidden: true,
  },
];

/** Режимы, которые видят игроки: форма комнаты и главная игры. */
export const PLAYER_MODES: readonly ModeInfo[] = MODES.filter(
  (mode) => !mode.hidden,
);

export const MODE_IDS: readonly TurboMode[] = MODES.map((mode) => mode.id);

const BY_ID = new Map(MODES.map((mode) => [mode.id, mode]));

export function modeInfo(id: TurboMode): ModeInfo {
  const info = BY_ID.get(id);
  if (!info) throw new Error(`Нет такого режима: ${id}`);
  return info;
}

/**
 * Уровни ботов.
 *
 * Четыре видимых, заданных целевым рейтингом. Слабее 1320 у движка нет вовсе —
 * это его нижняя граница, и обходить её подкруткой не станем: получится не
 * слабый соперник, а ошибающийся невпопад
 * (src/games/chess/docs/BACKLOG.md D2).
 *
 * «Эксперт» назван так намеренно, а не «невозможным»: за ним есть пятый,
 * скрытый, и путь к нему должен существовать (D3).
 */

export type LevelId = "easy" | "normal" | "hard" | "expert" | "magnus";

export interface Level {
  id: LevelId;
  title: string;
  /** Целевой рейтинг: движок подстраивает силу под него сам. */
  elo: number;
  /**
   * Потолок просмотренных позиций на ход. Ограничение силы — узлами, а не
   * временем: время зависит от загрузки сервера.
   */
  nodes: number;
  /** Как уровень объясняется человеку в форме. */
  hint: string;
  /**
   * Уровня нет в списке, пока его не открыли. Скрытый — ровно один, и это
   * шутка, ради которой всё затевалось (src/games/chess/docs/BACKLOG.md D3).
   */
  hidden?: true;
}

export const LEVELS: Record<LevelId, Level> = {
  easy: {
    id: "easy",
    title: "Лёгкий",
    elo: 1400,
    nodes: 20_000,
    hint: "зевает, но не подставляет ферзя под пешку",
  },
  normal: {
    id: "normal",
    title: "Нормальный",
    elo: 1700,
    nodes: 60_000,
    hint: "играет ровно, ошибается редко",
  },
  hard: {
    id: "hard",
    title: "Сложный",
    elo: 1950,
    nodes: 200_000,
    hint: "наказывает за неточности",
  },
  expert: {
    id: "expert",
    title: "Эксперт",
    elo: 2450,
    nodes: 600_000,
    hint: "выиграть трудно; десять побед открывают кое-что ещё",
  },

  /**
   * Магнус. Рекорд живого Магнуса Карлсена — 2882; бот играет чуть выше, ровно
   * настолько, чтобы это читалось как шутка, а не как ошибка в числе.
   *
   * Остальные триста пунктов до потолка — не про силу, а про жульничество: оно
   * даёт куда больше (src/games/chess/docs/BACKLOG.md D3).
   */
  magnus: {
    id: "magnus",
    title: "Магнус",
    elo: 2900,
    nodes: 2_000_000,
    hint: "играет как Магнус и жульничает как Магнус",
    hidden: true,
  },
};

/** Сколько побед над «экспертом» открывают Магнуса. */
export const MAGNUS_WINS = 10;

export const LEVEL_IDS = Object.keys(LEVELS) as LevelId[];

/** Уровни, которые видно в форме этому человеку. */
export function levelsFor(expertWins: number): LevelId[] {
  const unlocked = expertWins >= MAGNUS_WINS;

  return LEVEL_IDS.filter((id) => !LEVELS[id].hidden || unlocked);
}

/** Уровень по коду. Незнакомый код — «нормальный»: играть всё равно надо. */
export function levelOf(id: unknown): Level {
  return LEVELS[id as LevelId] ?? LEVELS.normal;
}

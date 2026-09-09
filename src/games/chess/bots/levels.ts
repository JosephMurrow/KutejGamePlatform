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

export type LevelId = "easy" | "normal" | "hard" | "expert";

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
};

export const LEVEL_IDS = Object.keys(LEVELS) as LevelId[];

/** Уровень по коду. Незнакомый код — «нормальный»: играть всё равно надо. */
export function levelOf(id: unknown): Level {
  return LEVELS[id as LevelId] ?? LEVELS.normal;
}

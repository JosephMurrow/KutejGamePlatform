/**
 * Формы данных таблицы рейтинга.
 *
 * Живут отдельно от запросов к базе намеренно: таблицу рисует и серверная
 * страница, и клиентское окно поверх комнаты, а один импорт из модуля с
 * `prisma` утащил бы в браузерный бандл весь драйвер базы. У платитутки те же
 * формы лежат в `src/shared/leaderboard.ts` и по той же причине.
 */

/** Сколько строк показываем. */
export const TOP_SIZE = 100;

export interface ChessRow {
  rank: number;
  userId: string;
  nickname: string;
  avatarId: number;
  /** Рейтинг общего зала, округлённый. */
  rating: number;
  /** Ещё не устоялся: рисуется с вопросительным знаком. */
  provisional: boolean;
  /** Партий с людьми: зал и приватные вместе. */
  games: number;
  /** Суммарный: рейтинг зала плюс накопленная надбавка. */
  sum: number;
}

export interface ChessBoard {
  rows: ChessRow[];
  /** Строка игрока, если он не попал в показанное. */
  you: ChessRow | null;
  /** Сколько всего игроков в зачёте. */
  players: number;
}

/** Что окно получает от сервера. */
export interface BoardView {
  board: ChessBoard;
  viewerId: string;
}

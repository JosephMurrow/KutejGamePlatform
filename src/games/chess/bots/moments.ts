/**
 * Моменты партии, в которые боту есть что сказать.
 *
 * Список закрытый и полный: реплики пишутся под каждый момент, и добавить
 * новый — значит дописать их всем четверым. Крайние случаи выделены отдельно
 * намеренно — именно на них молчание заметнее всего: пат, флаг, ферзь, уход
 * соперника (src/games/chess/docs/BACKLOG.md D4).
 */

export type Moment =
  // — начало и течение —
  /** Сел за доску, партия начинается. */
  | "greeting"
  /** Первые ходы: дебют идёт по книге. */
  | "opening"
  /** Дебют кончился, началась своя игра. */
  | "outOfBook"
  /** Фигур на доске мало: эндшпиль. */
  | "endgame"
  /** Партия затянулась: ходов уже очень много. */
  | "longGame"

  // — ходы бота —
  /** Забрал фигуру. */
  | "botCapture"
  /** Забрал ферзя: самая дорогая добыча. */
  | "botTakesQueen"
  /** Поставил шах. */
  | "botChecks"
  /** Провёл пешку в ферзи. */
  | "botPromotes"
  /** Рокировался. */
  | "botCastles"
  /** Сам сыграл плохо: осознанный зевок уровня. */
  | "botBlunder"

  // — ходы игрока —
  /** Игрок забрал фигуру бота. */
  | "botLosesPiece"
  /** Игрок забрал у бота ферзя. */
  | "botLosesQueen"
  /** Игрок поставил шах боту. */
  | "botInCheck"
  /** Игрок зевнул. */
  | "playerBlunder"
  /** Игрок нашёл сильный ход. */
  | "playerGoodMove"

  // — время —
  /** Игрок думает очень долго. */
  | "playerThinksLong"
  /** У игрока вот-вот упадёт флаг. */
  | "playerLowTime"
  /** У бота вот-вот упадёт флаг. */
  | "botLowTime"

  // — положение —
  /** Бот заметно впереди по материалу. */
  | "winning"
  /** Бот заметно позади. */
  | "losing"

  // — конец —
  /** Бот поставил мат. */
  | "botWins"
  /** Боту поставили мат. */
  | "botLoses"
  /** Пат: ничья, которой никто не хотел. */
  | "stalemate"
  /** Ничья по соглашению или повторению. */
  | "draw"
  /** У игрока упал флаг. */
  | "playerFlagged"
  /** У бота упал флаг. */
  | "botFlagged"
  /** Игрок сдался. */
  | "playerResigned"
  /** Бот сдался. */
  | "botResigned"

  // — соперник —
  /** Игрок ушёл и его ждут. */
  | "playerLeft"
  /** Игрок вернулся. */
  | "playerReturned"
  /** Ещё партия. */
  | "rematch";

/** Все моменты по порядку: по нему проверяется полнота наборов. */
export const MOMENTS: Moment[] = [
  "greeting",
  "opening",
  "outOfBook",
  "endgame",
  "longGame",
  "botCapture",
  "botTakesQueen",
  "botChecks",
  "botPromotes",
  "botCastles",
  "botBlunder",
  "botLosesPiece",
  "botLosesQueen",
  "botInCheck",
  "playerBlunder",
  "playerGoodMove",
  "playerThinksLong",
  "playerLowTime",
  "botLowTime",
  "winning",
  "losing",
  "botWins",
  "botLoses",
  "stalemate",
  "draw",
  "playerFlagged",
  "botFlagged",
  "playerResigned",
  "botResigned",
  "playerLeft",
  "playerReturned",
  "rematch",
];

/** Характеры. Характер не зависит от уровня: слабый педант возможен. */
export type Character = "pedant" | "brute" | "granddad" | "champion";

export const CHARACTERS: Character[] = [
  "pedant",
  "brute",
  "granddad",
  "champion",
];

/** Набор реплик одного характера: на каждый момент — свой список. */
export type Lines = Record<Moment, string[]>;

/**
 * Момент, ради которого всё затевалось, — мат. Реплика на него идёт в обход
 * паузы: молчать здесь нельзя (src/games/chess/docs/BACKLOG.md D4).
 */
export const URGENT: Moment[] = ["botWins", "botLoses"];

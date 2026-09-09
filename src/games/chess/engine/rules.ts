import { Chess, type Color, type Square } from "chess.js";
import type { EndReason, Outcome } from "./outcome";

/**
 * Правила партии: единственное место игры, которое знает про `chess.js`.
 *
 * Всё остальное — комната, сокет, доска — говорит с партией только через этот
 * файл. Понадобится однажды сменить библиотеку — менять придётся здесь и
 * больше нигде (src/games/chess/docs/BACKLOG.md B1).
 *
 * Сети и времени тут нет: часы живут снаружи и сообщают сюда только сам факт
 * упавшего флага. Так правила можно прогнать тестами целиком.
 */

/** Ход на проводе: координаты и фигура превращения, а не запись партии. */
export interface MoveInput {
  from: string;
  to: string;
  /** Во что превращать пешку. Обязательна, если пешка доходит до края. */
  promotion?: "q" | "r" | "b" | "n";
}

/** Принятый ход: всё, что о нём знает сервер. */
export interface MoveRecord {
  from: string;
  to: string;
  promotion?: string;
  /** Запись хода. Её считает сервер: от позиции она зависит, клиент — нет. */
  san: string;
  /** Какой это полуход по счёту, начиная с первого. */
  ply: number;
  /** Позиция после хода. */
  fen: string;
  /** Ход поставил шах. */
  check: boolean;
}

/** Почему ход не принят. */
export type MoveRejection =
  /** Партия уже кончилась. */
  | "gameOver"
  /** Сейчас ходит соперник. */
  | "notYourTurn"
  /**
   * Клиент считает ход другим по счёту. Так отсеиваются двойной клик, повтор
   * при переподключении и премув, обогнавший настоящий ход
   * (src/games/chess/docs/BACKLOG.md B1).
   */
  | "stalePly"
  /** Пешка доходит до края, а фигура превращения не названа. */
  | "needsPromotion"
  /** Ход нелегален в этой позиции. */
  | "illegal";

export type MoveResult =
  | { ok: true; move: MoveRecord; outcome: Outcome | null }
  | { ok: false; reason: MoveRejection };

/** Фигуры, которыми в одиночку мат не поставить. */
const LIGHT = new Set(["b", "n"]);

export class ChessGame {
  private readonly chess: Chess;
  /**
   * Сколько раз встречалась каждая позиция. Ключ — Zobrist-хеш: он учитывает
   * и права рокировки, и поле взятия на проходе, поэтому «та же расстановка»
   * с разными правами считается разными позициями, как и требуют правила.
   *
   * Свой счётчик нужен ради пятикратного повторения: библиотека знает только
   * троекратное (src/games/chess/docs/BACKLOG.md B1).
   */
  private readonly seen = new Map<string, number>();
  private ended: Outcome | null = null;
  /** Последний ход координатами: по нему доска подсвечивает, откуда и куда. */
  private last: { from: string; to: string } | null = null;

  constructor(fen?: string) {
    this.chess = new Chess(fen);
    this.remember();
  }

  fen(): string {
    return this.chess.fen();
  }

  /** Чей ход. */
  turn(): Color {
    return this.chess.turn();
  }

  /** Сколько полуходов сделано. */
  ply(): number {
    return this.chess.history().length;
  }

  /** Записи ходов по порядку. */
  history(): string[] {
    return this.chess.history();
  }

  /** Откуда и куда пошли последний раз; `null` — ходов ещё не было. */
  lastMove(): { from: string; to: string } | null {
    return this.last;
  }

  outcome(): Outcome | null {
    return this.ended;
  }

  isOver(): boolean {
    return this.ended !== null;
  }

  /**
   * Сделать ход.
   *
   * `expectedPly` — каким по счёту этот ход считает клиент. Несовпадение
   * означает, что клиент отстал или прислал повтор, и ход отбрасывается.
   */
  move(input: MoveInput, expectedPly: number): MoveResult {
    if (this.ended) return { ok: false, reason: "gameOver" };
    if (expectedPly !== this.ply()) return { ok: false, reason: "stalePly" };

    const normalized = this.normalizeCastling(input);
    if (this.needsPromotion(normalized) && !normalized.promotion) {
      // Библиотека на этом бросает исключение; нам нужна внятная причина,
      // а не пятисотка (src/games/chess/docs/BACKLOG.md B3).
      return { ok: false, reason: "needsPromotion" };
    }

    let made;
    try {
      made = this.chess.move(normalized);
    } catch {
      // Единственная причина исключения здесь — нелегальный ход: остальное
      // отсеяно выше.
      return { ok: false, reason: "illegal" };
    }

    this.remember();
    this.last = { from: made.from, to: made.to };

    return {
      ok: true,
      move: {
        from: made.from,
        to: made.to,
        promotion: made.promotion,
        san: made.san,
        ply: this.ply(),
        fen: this.chess.fen(),
        check: this.chess.inCheck(),
      },
      outcome: this.detect(),
    };
  }

  /** Сдался. */
  resign(color: Color): Outcome | null {
    return this.finish(color === "w" ? "black" : "white", "resign");
  }

  /**
   * У этой стороны упал флаг.
   *
   * Если сопернику нечем ставить мат — ничья, а не поражение. Это правило
   * забывают чаще всего остального, и оно есть и у Lichess, и у Chess.com
   * (src/games/chess/docs/BACKLOG.md B4).
   */
  flag(color: Color): Outcome | null {
    const opponent: Color = color === "w" ? "b" : "w";

    if (!this.canMate(opponent)) {
      return this.finish("draw", "flagVsInsufficient");
    }

    return this.finish(color === "w" ? "black" : "white", "flag");
  }

  /**
   * Партия упёрлась в потолок — ничья. Не правило шахмат, а предохранитель:
   * лимит на ход ограничивает ход, но не длину партии.
   */
  capOut(): Outcome | null {
    return this.finish("draw", "tooLong");
  }

  /** Согласились на ничью. */
  agreeDraw(): Outcome | null {
    return this.finish("draw", "agreement");
  }

  /**
   * Есть ли прямо сейчас основание требовать ничью.
   *
   * По правилам троекратное повторение и пятьдесят ходов — это **право
   * заявить**, а не автоматический конец: партия идёт, пока никто не заявил.
   * Автоматом кончаются только пятикратное и семьдесят пять
   * (src/games/chess/docs/SPEC.md).
   *
   * Основание считается от текущей позиции и пропадает, как только она
   * изменилась: повторение расплетается ходом пешки или взятием.
   */
  claimableDraw(): "threefold" | "fiftyMoves" | null {
    if (this.ended) return null;
    if ((this.seen.get(this.chess.hash()) ?? 0) >= 3) return "threefold";
    if (this.halfmoveClock() >= 100) return "fiftyMoves";

    return null;
  }

  /**
   * Игрок требует ничью. Без основания заявление ничего не делает.
   *
   * Заявить может любой из двоих, а не только тот, чья очередь хода: так это
   * работает на площадках, и спорить с привычкой дороже, чем следовать букве
   * правила про очередь.
   */
  claimDraw(): Outcome | null {
    const ground = this.claimableDraw();
    if (!ground) return null;

    return this.finish("draw", ground);
  }

  /** Ушёл и не вернулся: партия достаётся сопернику. */
  abandon(color: Color): Outcome | null {
    return this.finish(color === "w" ? "black" : "white", "abandoned");
  }

  /**
   * Разошлись до первого хода. Такой партии как будто и не было: она не идёт
   * ни в рейтинг, ни в историю.
   */
  abort(): Outcome | null {
    if (this.ply() > 0) return null;
    return this.finish("draw", "aborted");
  }

  /**
   * Может ли эта сторона в принципе поставить мат.
   *
   * Библиотечная `isInsufficientMaterial()` отвечает про обе стороны сразу, а
   * при упавшем флаге вопрос стоит про одну (src/games/chess/docs/BACKLOG.md B1).
   *
   * Матовать нечем с голым королём и с одной лёгкой фигурой, а также любым
   * числом слонов на полях одного цвета. Два коня оставляем достаточными: мат
   * ими не форсируется, но возможен, а правило говорит именно о возможности.
   */
  canMate(color: Color): boolean {
    const own = this.chess
      .board()
      .flat()
      .filter(
        (square): square is NonNullable<typeof square> =>
          square !== null && square.color === color,
      );

    if (own.some((piece) => !LIGHT.has(piece.type) && piece.type !== "k")) {
      return true;
    }

    const knights = own.filter((piece) => piece.type === "n").length;
    const bishops = own.filter((piece) => piece.type === "b");

    if (knights >= 2 || (knights >= 1 && bishops.length >= 1)) return true;
    if (knights >= 1) return false;

    // Слоны, стоящие на полях одного цвета, не покрывают доску и мата не дают,
    // сколько бы их ни было.
    const colors = new Set(
      bishops.map((piece) => this.chess.squareColor(piece.square as Square)),
    );

    return colors.size > 1;
  }

  /** Позиция после хода: не кончилась ли партия сама собой. */
  private detect(): Outcome | null {
    if (this.chess.isCheckmate()) {
      // Ходит тот, кому мат поставили.
      return this.finish(this.turn() === "w" ? "black" : "white", "checkmate");
    }
    if (this.chess.isStalemate()) return this.finish("draw", "stalemate");
    if (this.chess.isInsufficientMaterial()) {
      return this.finish("draw", "insufficient");
    }

    // Дальше — только то, что кончает партию само, без всякой заявки.
    // Троекратное и пятьдесят ходов дают право требовать ничью, и его
    // реализует `claimDraw`.
    if ((this.seen.get(this.chess.hash()) ?? 0) >= 5) {
      return this.finish("draw", "fivefold");
    }
    if (this.halfmoveClock() >= 150) {
      return this.finish("draw", "seventyFiveMoves");
    }

    return null;
  }

  /**
   * Единственная дверь из партии.
   *
   * Первым делом проверяет, что партия ещё идёт: иначе сдача, пришедшая
   * одновременно с матом, посчиталась бы дважды
   * (src/games/chess/docs/BACKLOG.md B4).
   */
  private finish(result: Outcome["result"], reason: EndReason): Outcome | null {
    if (this.ended) return null;

    this.ended = { result, reason };
    return this.ended;
  }

  private remember(): void {
    const key = this.chess.hash();
    this.seen.set(key, (this.seen.get(key) ?? 0) + 1);
  }

  /** Полуходы без взятий и ходов пешкой — их считает сама библиотека в FEN. */
  private halfmoveClock(): number {
    return Number(this.chess.fen().split(" ")[4] ?? 0);
  }

  /** Доходит ли пешка этим ходом до последней горизонтали. */
  private needsPromotion(input: MoveInput): boolean {
    const piece = this.chess.get(input.from as Square);
    if (!piece || piece.type !== "p") return false;

    const rank = input.to[1];
    return piece.color === "w" ? rank === "8" : rank === "1";
  }

  /**
   * Рокировка «королём на свою ладью» — в вид, который понимает библиотека.
   *
   * Люди делают её двумя способами, и оба приходят с доски; правила знают
   * только один (src/games/chess/docs/BACKLOG.md B3).
   */
  private normalizeCastling(input: MoveInput): MoveInput {
    const king = this.chess.get(input.from as Square);
    const target = this.chess.get(input.to as Square);

    const ownRook =
      king?.type === "k" && target?.type === "r" && target.color === king.color;
    if (!ownRook) return input;

    const rank = input.from[1];
    const kingside = input.to[0] === "h";

    return { ...input, to: `${kingside ? "g" : "c"}${rank}` };
  }
}

import { parseSquare, squareName } from "./geometry";
import type { Piece, PieceKind, Side } from "./pieces";
import { classicPosition, type Position } from "./position";
import {
  canMate,
  inCheck,
  insufficientMaterial,
  legalMoves,
  play,
  repetitionKey,
  san,
  type Move,
} from "./moves";
import type { EndReason, Outcome, Result } from "./outcome";

/**
 * Партия: позиция, история, окончания.
 *
 * Фасад повторяет шахматный `ChessGame` (src/games/chess/engine/rules.ts):
 * комната турбо-шахмат будет его копией, и подмена движка под ней должна быть
 * незаметна (docs/BACKLOG.md B1). Отличий два, и оба от доски: позиция — объект,
 * а не FEN, и сторона — номер места, а не буква цвета.
 *
 * Сети и времени тут нет: часы живут снаружи и сообщают сюда только сам факт
 * упавшего флага. Так правила прогоняются тестами целиком.
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
  promotion?: PieceKind;
  /** Запись хода. Её считает сервер: от позиции она зависит, клиент — нет. */
  san: string;
  /** Какой это полуход по счёту, начиная с первого. */
  ply: number;
  /** Ход поставил шах. */
  check: boolean;
  /** Кого забрали этим ходом. */
  captured?: PieceKind;
}

/** Почему ход не принят — те же причины, что у шахмат. */
export type MoveRejection =
  | "gameOver"
  /** Сейчас ходит соперник. Решает комната: только она знает, кто где сидит. */
  | "notYourTurn"
  /**
   * Клиент считает ход другим по счёту. Так отсеиваются двойной клик, повтор
   * при переподключении и премув, обогнавший настоящий ход.
   */
  | "stalePly"
  /** Пешка доходит до края, а фигура превращения не названа. */
  | "needsPromotion"
  | "illegal";

export type MoveResult =
  | { ok: true; move: MoveRecord; outcome: Outcome | null }
  | { ok: false; reason: MoveRejection };

/**
 * Соперник, когда за столом двое. В королевской битве сдача и флаг станут
 * выбыванием одного из четверых (docs/PLAN.md, этап 14).
 */
function opponent(side: Side): Side {
  return side === 0 ? 1 : 0;
}

/** Шаг истории: позиция, её ключ повторений и ход, который к ней привёл. */
interface Step {
  position: Position;
  key: string;
  record: MoveRecord | null;
}

export class TurboGame {
  private readonly steps: Step[] = [];
  private top: Step;
  /**
   * Сколько раз встречалась каждая позиция. Ключ — по ФИДЕ, с правами
   * рокировки и законным взятием на проходе (moves.ts, `repetitionKey`).
   */
  private readonly seen = new Map<string, number>();
  private ended: Outcome | null = null;

  constructor(start: Position = classicPosition()) {
    this.top = { position: start, key: repetitionKey(start), record: null };
    this.steps.push(this.top);
    this.count(this.top.key, 1);
  }

  position(): Position {
    return this.top.position;
  }

  /** Ключ текущей позиции — тот, по которому считаются повторения. */
  key(): string {
    return this.top.key;
  }

  /** Чей ход. */
  turn(): Side {
    return this.top.position.turn;
  }

  /** Сколько полуходов сделано. */
  ply(): number {
    return this.steps.length - 1;
  }

  /** Принятые ходы по порядку. */
  moves(): MoveRecord[] {
    return this.steps.flatMap((step) => (step.record ? [step.record] : []));
  }

  /** Записи ходов по порядку. */
  history(): string[] {
    return this.moves().map((record) => record.san);
  }

  /** Какая фигура стоит на клетке; `null` — пусто или клетки такой нет. */
  pieceAt(square: string): Piece | null {
    const index = parseSquare(this.top.position.geometry, square);
    return index === null ? null : (this.top.position.board[index] ?? null);
  }

  /** Откуда и куда пошли последний раз; `null` — ходов ещё не было. */
  lastMove(): { from: string; to: string } | null {
    const record = this.top.record;
    return record ? { from: record.from, to: record.to } : null;
  }

  /** Законные ходы стороны, чья очередь: для подсказок на доске и для ботов. */
  legal(): MoveInput[] {
    const { geometry } = this.top.position;

    return legalMoves(this.top.position).map((move) => ({
      from: squareName(geometry, move.from),
      to: squareName(geometry, move.to),
      ...(move.promotion
        ? { promotion: move.promotion as MoveInput["promotion"] }
        : {}),
    }));
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

    const position = this.top.position;
    const { geometry } = position;
    const from = parseSquare(geometry, input.from);
    const target = parseSquare(geometry, input.to);
    if (from === null || target === null) {
      return { ok: false, reason: "illegal" };
    }
    const to = this.normalizeCastling(from, target);

    const legal = legalMoves(position);
    const matching = legal.filter(
      (move) => move.from === from && move.to === to,
    );
    if (matching.length === 0) return { ok: false, reason: "illegal" };

    let chosen: Move | undefined;
    if (matching.some((move) => move.promotion)) {
      if (!input.promotion) return { ok: false, reason: "needsPromotion" };
      chosen = matching.find((move) => move.promotion === input.promotion);
    } else {
      // Фигуру превращения при обычном ходе молча пропускаем — так же
      // поступает библиотека шахмат, и клиенту незачем за это отказывать.
      chosen = matching[0];
    }
    if (!chosen) return { ok: false, reason: "illegal" };

    const after = play(position, chosen);
    const record: MoveRecord = {
      from: squareName(geometry, chosen.from),
      to: squareName(geometry, chosen.to),
      ...(chosen.promotion ? { promotion: chosen.promotion } : {}),
      san: san(position, chosen, legal),
      ply: this.ply() + 1,
      check: inCheck(after, after.turn),
      ...(chosen.captured ? { captured: chosen.captured.kind } : {}),
    };

    this.top = { position: after, key: repetitionKey(after), record };
    this.steps.push(this.top);
    this.count(this.top.key, 1);

    return { ok: true, move: record, outcome: this.detect() };
  }

  /**
   * Взять последний ход назад.
   *
   * Правилами обычных шахмат такого нет, но у турбо-шахмат есть режим, где это
   * и есть правило, — «Анархия», большая красная кнопка «НЕТ»
   * (docs/MODES.md, режим 15). Кончившуюся партию не воскрешает.
   */
  undo(): boolean {
    if (this.ended || this.steps.length <= 1) return false;

    const gone = this.steps.pop();
    if (gone) this.count(gone.key, -1);
    this.top = this.steps[this.steps.length - 1] ?? this.top;

    return true;
  }

  /** Сдался. */
  resign(side: Side): Outcome | null {
    return this.finish(opponent(side), "resign");
  }

  /**
   * У этой стороны упал флаг. Если сопернику нечем ставить мат — ничья, а не
   * поражение: это правило забывают чаще всего остального.
   */
  flag(side: Side): Outcome | null {
    if (!this.canMate(opponent(side))) {
      return this.finish("draw", "flagVsInsufficient");
    }
    return this.finish(opponent(side), "flag");
  }

  /** Партия упёрлась в потолок — ничья. Предохранитель, а не правило. */
  capOut(): Outcome | null {
    return this.finish("draw", "tooLong");
  }

  /** Согласились на ничью. */
  agreeDraw(): Outcome | null {
    return this.finish("draw", "agreement");
  }

  /**
   * Есть ли прямо сейчас основание требовать ничью. Троекратное повторение и
   * пятьдесят ходов — право заявить, а не конец; основание считается от
   * текущей позиции и пропадает, как только она изменилась.
   */
  claimableDraw(): "threefold" | "fiftyMoves" | null {
    if (this.ended) return null;
    if ((this.seen.get(this.top.key) ?? 0) >= 3) return "threefold";
    if (this.top.position.quiet >= 100) return "fiftyMoves";

    return null;
  }

  /** Игрок требует ничью. Без основания заявление ничего не делает. */
  claimDraw(): Outcome | null {
    const ground = this.claimableDraw();
    return ground ? this.finish("draw", ground) : null;
  }

  /** Ушёл и не вернулся: партия достаётся сопернику. */
  abandon(side: Side): Outcome | null {
    return this.finish(opponent(side), "abandoned");
  }

  /** Разошлись до первого хода: такой партии как будто и не было. */
  abort(): Outcome | null {
    if (this.ply() > 0) return null;
    return this.finish("draw", "aborted");
  }

  /** Может ли эта сторона в принципе поставить мат. */
  canMate(side: Side): boolean {
    return canMate(this.top.position, side);
  }

  /** Позиция после хода: не кончилась ли партия сама собой. */
  private detect(): Outcome | null {
    const position = this.top.position;

    if (legalMoves(position).length === 0) {
      // Ходить нечем тому, чья очередь: под шахом — мат, без шаха — пат.
      return inCheck(position, position.turn)
        ? this.finish(opponent(position.turn), "checkmate")
        : this.finish("draw", "stalemate");
    }
    if (insufficientMaterial(position)) {
      return this.finish("draw", "insufficient");
    }

    // Дальше — только то, что кончает партию само, без заявки.
    if ((this.seen.get(this.top.key) ?? 0) >= 5) {
      return this.finish("draw", "fivefold");
    }
    if (position.quiet >= 150) return this.finish("draw", "seventyFiveMoves");

    return null;
  }

  /**
   * Единственная дверь из партии. Первым делом проверяет, что партия ещё
   * идёт: иначе сдача, пришедшая одновременно с матом, посчиталась бы дважды.
   */
  private finish(result: Result, reason: EndReason): Outcome | null {
    if (this.ended) return null;

    this.ended = { result, reason };
    return this.ended;
  }

  private count(key: string, delta: number): void {
    const seen = (this.seen.get(key) ?? 0) + delta;
    if (seen <= 0) this.seen.delete(key);
    else this.seen.set(key, seen);
  }

  /**
   * Рокировка «королём на свою ладью» — в обычный вид. Люди делают её двумя
   * способами, и оба приходят с доски; так же принимают шахматы.
   */
  private normalizeCastling(from: number, to: number): number {
    const { board, castling } = this.top.position;
    const king = board[from];
    const rook = board[to];
    if (king?.kind !== "k" || rook?.kind !== "r" || rook.side !== king.side) {
      return to;
    }

    const right = castling.find(
      (candidate) => candidate.king === from && candidate.rook === to,
    );
    return right ? right.kingTo : to;
  }
}

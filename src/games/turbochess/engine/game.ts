import { parseSquare, squareName } from "./geometry";
import type { Piece, PieceKind, Side } from "./pieces";
import {
  STALL_PLIES,
  classicPosition,
  kingIsRoyal,
  type Position,
} from "./position";
import {
  DROP,
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

/** Что можно выставить из резерва: всё, кроме короля. */
export type DropKind = "q" | "r" | "b" | "n" | "p";

/** Ход на проводе: координаты и фигура превращения, а не запись партии. */
export interface MoveInput {
  /** Откуда идут. У выставления из резерва её нет — есть `drop`. */
  from?: string;
  to: string;
  /** Во что превращать пешку. Обязательна, если пешка доходит до края. */
  promotion?: "q" | "r" | "b" | "n";
  /** Какую фигуру выставляют из резерва — вместо `from`. */
  drop?: DropKind;
}

/** Принятый ход: всё, что о нём знает сервер. */
export interface MoveRecord {
  /** У выставленной из резерва — та же клетка, что и `to`: она ниоткуда. */
  from: string;
  to: string;
  promotion?: PieceKind;
  /** Что выставили из резерва. */
  drop?: PieceKind;
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

    return legalMoves(this.top.position).map((move) =>
      move.from === DROP
        ? {
            drop: move.piece.kind as DropKind,
            to: squareName(geometry, move.to),
          }
        : {
            from: squareName(geometry, move.from),
            to: squareName(geometry, move.to),
            ...(move.promotion
              ? { promotion: move.promotion as MoveInput["promotion"] }
              : {}),
          },
    );
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
    const target = parseSquare(geometry, input.to);
    if (target === null) return { ok: false, reason: "illegal" };

    const legal = legalMoves(position);
    const matching = this.matching(input, legal, target);
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
    const drop = chosen.from === DROP;
    const record: MoveRecord = {
      from: squareName(geometry, drop ? chosen.to : chosen.from),
      to: squareName(geometry, chosen.to),
      ...(drop ? { drop: chosen.piece.kind } : {}),
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
   *
   * Правило это матовое: там, где партию выигрывают не матом, «нечем
   * матовать» не бывает, и флаг — просто поражение.
   */
  flag(side: Side): Outcome | null {
    if (kingIsRoyal(this.top.position) && !this.canMate(opponent(side))) {
      return this.finish("draw", "flagVsInsufficient");
    }
    return this.finish(opponent(side), "flag");
  }

  /**
   * Сбросить бомбу: только в свой ход и вместо хода — партия сразу кончается
   * победой (docs/MODES.md, режим 8).
   *
   * Заряжена ли она, знает комната: порог лежит в настройках, а очки
   * считаются по взятым фигурам (modes/nuclear.ts). Фасаду остаётся то, что и
   * всем прочим выходам, — проверить, что партия идёт и очередь твоя.
   */
  dropBomb(side: Side): Outcome | null {
    if (this.ended || this.turn() !== side) return null;
    return this.finish(side, "nuke");
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
    // «На уничтожение» стоит на своём счёте взятых: ничья по повторению была
    // бы там лазейкой для того, кто съел меньше.
    if (this.top.position.rules.goal === "wipe") return null;
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

  /**
   * Позиция после хода: не кончилась ли партия сама собой. Чем она кончается,
   * сказано в самой позиции — режим кладёт это туда начальной расстановкой.
   */
  private detect(): Outcome | null {
    const position = this.top.position;

    switch (position.rules.goal) {
      case "wipe":
        return this.detectWipe(position);
      case "feed":
        return this.detectFeed(position);
      default:
        return this.detectMate(position);
    }
  }

  /** Обычная цель: мат, пат, недостаток материала, повторения. */
  private detectMate(position: Position): Outcome | null {
    if (legalMoves(position).length === 0) {
      // Ходить нечем тому, чья очередь: под шахом — мат, без шаха — пат.
      return inCheck(position, position.turn)
        ? this.finish(opponent(position.turn), "checkmate")
        : this.finish("draw", "stalemate");
    }
    if (insufficientMaterial(position)) {
      return this.finish("draw", "insufficient");
    }

    return this.autoDraw(position);
  }

  /**
   * «На уничтожение»: снял с доски всё — выиграл. Мата нет, а значит нет и
   * пата: сторона без ходов не проигрывает, а останавливает партию, и счёт
   * идёт по взятым фигурам — так же, как после полусотни полуходов, в которые
   * никто никого не съел (docs/MODES.md, режим 3).
   */
  private detectWipe(position: Position): Outcome | null {
    const wiped = position.sides.findIndex(
      (_, side) => !position.board.some((cell) => cell?.side === side),
    );
    if (wiped >= 0) return this.finish(opponent(wiped), "wiped");

    if (
      legalMoves(position).length === 0 ||
      position.sinceCapture >= STALL_PLIES
    ) {
      return this.countTaken(position);
    }

    return null;
  }

  /** Партия остановлена: победа тому, кто взял больше фигур; поровну — ничья. */
  private countTaken(position: Position): Outcome | null {
    const counts = position.taken.map((list) => list.length);
    const best = Math.max(...counts);
    const leaders = counts.filter((count) => count === best).length;

    return this.finish(
      leaders === 1 ? counts.indexOf(best) : "draw",
      "counted",
    );
  }

  /**
   * «Поддавки»: победил тот, чьего короля съели. Ходов не осталось — тоже
   * победа: отдавать больше нечего (docs/MODES.md, режим 11).
   *
   * Ничьи по повторению остаются предохранителем: короля скармливают не
   * всегда, а бегать друг от друга вечно партия не должна.
   */
  private detectFeed(position: Position): Outcome | null {
    const fed = position.sides.findIndex(
      (_, side) =>
        !position.board.some(
          (cell) => cell?.kind === "k" && cell.side === side,
        ),
    );
    if (fed >= 0) return this.finish(fed, "kingTaken");

    if (legalMoves(position).length === 0) {
      return this.finish(position.turn, "noMoves");
    }

    return this.autoDraw(position);
  }

  /** То, что кончает партию само, без заявки: пятикратное и семьдесят пять. */
  private autoDraw(position: Position): Outcome | null {
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
   * Ходы, подходящие под присланное. Несколько их бывает у превращения: одна
   * пара клеток, четыре фигуры.
   */
  private matching(
    input: MoveInput,
    legal: readonly Move[],
    target: number,
  ): Move[] {
    if (input.drop) {
      return legal.filter(
        (move) =>
          move.from === DROP &&
          move.piece.kind === input.drop &&
          move.to === target,
      );
    }

    const from =
      input.from === undefined
        ? null
        : parseSquare(this.top.position.geometry, input.from);
    if (from === null) return [];

    const to = this.normalizeCastling(from, target);
    return legal.filter((move) => move.from === from && move.to === to);
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

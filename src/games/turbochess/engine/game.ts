import { parseSquare, squareName } from "./geometry";
import { marked, piece, type Piece, type PieceKind, type Side } from "./pieces";
import {
  STALL_PLIES,
  alive,
  classicPosition,
  kingIsRoyal,
  nextSide,
  type Position,
} from "./position";
import {
  DROP,
  canMate,
  firstLine,
  homeSquare,
  inCheck,
  insufficientMaterial,
  legalMoves,
  play,
  reachedThrone,
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

/** Что покупают на чёрном рынке (docs/MODES.md, режим 13). */
export type MarketItem =
  /** Ходишь дважды подряд. */
  | "extra"
  /** Выбранная фигура переживает одно взятие. */
  | "shield"
  /** Своя фигура переносится на свободную клетку. */
  | "relocate"
  /** Две свои фигуры меняются местами. */
  | "swap"
  /** Взятая у тебя фигура возвращается на свои две горизонтали. */
  | "revive";

export interface MarketOrder {
  item: MarketItem;
  /** Клетка своей фигуры: щит, перестановка, обмен. */
  from?: string;
  /** Куда: перестановка, обмен, воскрешение. */
  to?: string;
  /** Кого воскрешают. */
  kind?: DropKind;
}

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

/** Прибавить стороне столько-то, дополнив список до числа сторон. */
function bump(
  counts: readonly number[],
  side: Side,
  delta: number,
  sides: number,
): number[] {
  return Array.from(
    { length: sides },
    (_, seat) => (counts[seat] ?? 0) + (seat === side ? delta : 0),
  );
}

/**
 * Выбыл: фигуры уходят с доски, а очередь — следующему живому
 * (docs/MODES.md, режим 9).
 */
function knockOut(position: Position, side: Side): Position {
  const board = position.board.map((cell) =>
    cell?.side === side ? null : cell,
  );
  const after: Position = { ...position, board };

  return position.turn === side
    ? { ...after, turn: nextSide(after, side) }
    : after;
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
      check: inCheck(after, nextSide(position, position.turn)),
      ...(chosen.captured ? { captured: chosen.captured.kind } : {}),
    };

    this.top = { position: after, key: repetitionKey(after), record };
    this.steps.push(this.top);
    this.count(this.top.key, 1);

    return { ok: true, move: record, outcome: this.detect() };
  }

  /**
   * Взять последний ход назад и вернуть его — это «НЕТ» анархии
   * (docs/MODES.md, режим 15). Кончившуюся партию не воскрешает.
   *
   * С `ban` отменённый ход запоминается в позиции запретом: повторить его
   * нельзя, соперник обязан сходить иначе — это правило анархии, а не самого
   * отката. Запрет в ключ повторений не входит: он живёт один ход.
   */
  undo(ban = false): MoveRecord | null {
    if (this.ended || this.steps.length <= 1) return null;

    const gone = this.steps.pop();
    if (!gone) return null;
    this.count(gone.key, -1);

    const back = this.steps[this.steps.length - 1];
    if (!back) return null;
    this.top = back;

    if (ban && gone.record) {
      const { geometry } = back.position;
      const from = parseSquare(geometry, gone.record.from);
      const to = parseSquare(geometry, gone.record.to);
      if (from !== null && to !== null) {
        back.position = {
          ...back.position,
          banned: { from, to, promotion: gone.record.promotion ?? null },
        };
      }
    }

    return gone.record;
  }

  /**
   * «Последний шанс»: король прыгает в случайную свободную клетку, и ход
   * переходит сопернику (docs/MODES.md, режим 7). Шанс один на партию, и
   * жать кнопку можно только под шахом — в том числе под матом.
   *
   * Куда прыгать, решает бросок: его делает комната по зерну партии, чтобы
   * партия воспроизводилась. Клетка берётся любая свободная, даже битая —
   * кнопка называется «попробовать», а не «спастись».
   */
  useChance(side: Side, roll: number): MoveResult {
    if (this.ended) return { ok: false, reason: "gameOver" };

    const position = this.top.position;
    if (position.turn !== side) return { ok: false, reason: "notYourTurn" };
    if ((position.chances[side] ?? 0) <= 0) {
      return { ok: false, reason: "illegal" };
    }
    if (!inCheck(position, side)) return { ok: false, reason: "illegal" };

    const { geometry } = position;
    const at = position.board.findIndex(
      (cell) => cell?.kind === "k" && cell.side === side,
    );
    const king = at < 0 ? null : position.board[at];
    const free = position.board.flatMap((cell, square) =>
      cell ? [] : [square],
    );
    const to = free[Math.floor(roll * free.length)];
    if (!king || to === undefined) return { ok: false, reason: "illegal" };

    const board = position.board.slice();
    board[at] = null;
    board[to] = king;

    const after: Position = {
      ...position,
      board,
      turn: nextSide(position, side),
      // Король сходил — права рокировки его стороны сгорают, как от хода.
      castling: position.castling.filter((right) => right.side !== side),
      enPassant: null,
      quiet: position.quiet + 1,
      sinceCapture: position.sinceCapture + 1,
      chances: position.chances.map((left, seat) =>
        seat === side ? left - 1 : left,
      ),
      banned: null,
    };

    const record: MoveRecord = {
      from: squareName(geometry, at),
      to: squareName(geometry, to),
      // Звёздочка — прыжок: обычной записи у него нет.
      san: `K*${squareName(geometry, to)}`,
      ply: this.ply() + 1,
      check: inCheck(after, after.turn),
    };

    this.top = { position: after, key: repetitionKey(after), record };
    this.steps.push(this.top);
    this.count(this.top.key, 1);

    return { ok: true, move: record, outcome: this.detect() };
  }

  /**
   * Штраф алко-шахмат: у каждой стороны снимается с доски случайная фигура,
   * кроме короля (docs/MODES.md, режим 5). Ходом это не считается — очередь и
   * счёт ходов не меняются, поэтому позиция правится на месте.
   */
  punish(rolls: readonly number[]): Outcome | null {
    if (this.ended) return null;

    const position = this.top.position;
    const board = position.board.slice();
    let hit = false;

    position.sides.forEach((_, side) => {
      const mine = position.board.flatMap((cell, square) =>
        cell && cell.side === side && cell.kind !== "k" ? [square] : [],
      );
      const at = mine[Math.floor((rolls[side] ?? 0) * mine.length)];
      if (at === undefined) return;

      board[at] = null;
      hit = true;
    });
    if (!hit) return null;

    this.replace({ ...position, board });

    return this.detect();
  }

  /**
   * Купить эффект чёрного рынка (docs/MODES.md, режим 13). Цену знает режим, а
   * хватает ли очков — проверяет комната; фасаду остаётся применить эффект и
   * записать трату.
   *
   * Покупка ходом не считается — кроме дополнительного хода, который ход и
   * есть: он кладётся в банк, и ближайший ход очередь не передаёт. Поэтому
   * позиция правится на месте, а не новым шагом истории.
   */
  market(side: Side, order: MarketOrder, price: number): boolean {
    if (this.ended) return false;

    const position = this.top.position;
    if (position.turn !== side) return false;

    const after = this.applyMarket(position, side, order);
    if (!after) return false;

    this.replace({
      ...after,
      spent: bump(after.spent, side, price, position.sides.length),
    });

    return true;
  }

  /** Что покупка делает с позицией; `null` — так купить нельзя. */
  private applyMarket(
    position: Position,
    side: Side,
    order: MarketOrder,
  ): Position | null {
    const { geometry } = position;
    const from = order.from ? parseSquare(geometry, order.from) : null;
    const to = order.to ? parseSquare(geometry, order.to) : null;
    const board = position.board.slice();

    const mine = (square: number | null): Piece | null => {
      const cell = square === null ? null : (board[square] ?? null);
      return cell && cell.side === side ? cell : null;
    };

    if (order.item === "extra") {
      return {
        ...position,
        extra: bump(position.extra, side, 1, position.sides.length),
      };
    }

    if (order.item === "shield") {
      const target = mine(from);
      if (from === null || !target || target.shield) return null;

      board[from] = marked(target, { shield: true });
      return { ...position, board };
    }

    if (order.item === "relocate") {
      const target = mine(from);
      if (from === null || to === null || !target) return null;
      if (board[to]) return null;

      board[from] = null;
      board[to] = target;
      return { ...position, board };
    }

    if (order.item === "swap") {
      const one = mine(from);
      const other = mine(to);
      if (from === null || to === null || !one || !other || from === to) {
        return null;
      }

      board[from] = other;
      board[to] = one;
      return { ...position, board };
    }

    // Воскрешение: фигуру берут из того, что забрал соперник, и ставят на
    // свою половину. Пешку на первую горизонталь не ставят — как и всегда.
    const kind = order.kind;
    if (!kind || to === null || board[to]) return null;
    if (!homeSquare(position, side, to)) return null;
    if (kind === "p" && firstLine(position, side, to)) return null;

    const grave = position.taken.map((list) => [...list]);
    const enemy = position.sides.findIndex((_, seat) => seat !== side);
    const at = (grave[enemy] ?? []).findIndex((cell) => cell.kind === kind);
    if (enemy < 0 || at < 0) return null;

    grave[enemy]?.splice(at, 1);
    board[to] = piece(kind, side);

    return { ...position, board, taken: grave };
  }

  /** Поменять текущую позицию, не делая нового хода. */
  private replace(position: Position): void {
    this.count(this.top.key, -1);
    this.top.position = position;
    this.top.key = repetitionKey(position);
    this.count(this.top.key, 1);
  }

  /**
   * «НЕТ»: отменить последний ход соперника (docs/MODES.md, режим 15).
   * Счётчик «НЕТ» лежит в позиции, и отмена его тратит.
   *
   * Отменить можно только новый чужой ход: два «НЕТ» подряд на один ход не
   * бывает, и своего хода отменить нельзя.
   */
  veto(side: Side): MoveRecord | null {
    const position = this.top.position;
    if ((position.vetoes[side] ?? 0) <= 0) return null;
    if (position.turn !== side) return null;
    if (position.banned) return null;

    const gone = this.undo(true);
    if (!gone) return null;

    this.top.position = {
      ...this.top.position,
      vetoes: this.top.position.vetoes.map((left, seat) =>
        seat === side ? left - 1 : left,
      ),
    };

    return gone;
  }

  /** Сдался. В битве это не конец партии, а выбывание из-за стола. */
  resign(side: Side): Outcome | null {
    if (this.top.position.rules.goal === "battle") return this.retire(side);

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
    if (this.top.position.rules.goal === "battle") return this.retire(side);
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
    // «На уничтожение» стоит на своём счёте взятых, а вчетвером ничьих не
    // бывает вовсе: там выбывают, а не соглашаются.
    const goal = this.top.position.rules.goal;
    if (goal === "wipe" || goal === "battle") return null;
    if ((this.seen.get(this.top.key) ?? 0) >= 3) return "threefold";
    if (this.top.position.quiet >= 100) return "fiftyMoves";

    return null;
  }

  /** Игрок требует ничью. Без основания заявление ничего не делает. */
  claimDraw(): Outcome | null {
    const ground = this.claimableDraw();
    return ground ? this.finish("draw", ground) : null;
  }

  /** Ушёл и не вернулся: партия достаётся сопернику, а в битве — выбывание. */
  abandon(side: Side): Outcome | null {
    if (this.top.position.rules.goal === "battle") return this.retire(side);

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
      case "battle":
        return this.detectBattle(position);
      default:
        return this.detectMate(position);
    }
  }

  /** Обычная цель: мат, пат, недостаток материала, повторения. */
  private detectMate(position: Position): Outcome | null {
    // Мега-шахматы: король на первой горизонтали соперника кончает партию
    // сразу, и мат при этом никуда не девается (docs/MODES.md, режим 4).
    if (position.rules.mega) {
      const throne = position.board.findIndex(
        (cell, square) =>
          cell?.kind === "k" && reachedThrone(position, cell.side, square),
      );
      if (throne >= 0) {
        const king = position.board[throne];
        if (king) return this.finish(king.side, "throne");
      }
    }

    // Короля съели: так бывает после телепорта последнего шанса, когда он
    // приземлился под бой.
    const kingless = position.sides.findIndex(
      (_, side) =>
        !position.board.some(
          (cell) => cell?.kind === "k" && cell.side === side,
        ),
    );
    if (kingless >= 0) return this.finish(opponent(kingless), "kingTaken");

    if (legalMoves(position).length === 0) {
      // Ходить нечем тому, чья очередь: под шахом — мат, без шаха — пат. В
      // пацанских шахматах пата нет: некуда ходить — проиграл.
      if (inCheck(position, position.turn)) {
        // Мат не кончает партию, пока у заматованного есть чем ответить:
        // неистраченный шанс или невыжатое «НЕТ».
        if (
          position.rules.lastChance &&
          (position.chances[position.turn] ?? 0) > 0
        ) {
          return null;
        }
        if (
          position.rules.anarchy &&
          (position.vetoes[position.turn] ?? 0) > 0
        ) {
          return null;
        }
        return this.finish(opponent(position.turn), "checkmate");
      }
      return position.rules.stalemate === "loss"
        ? this.finish(opponent(position.turn), "noMoves")
        : this.finish("draw", "stalemate");
    }
    if (insufficientMaterial(position)) {
      return this.finish("draw", "insufficient");
    }

    return this.autoDraw(position);
  }

  /**
   * «Королевская битва»: заматованный выбывает и уносит фигуры, запертый без
   * шаха пропускает ход, а когда за столом остаётся один — он и победил.
   *
   * Выбывание меняет позицию, поэтому она правится на месте: ходом это не
   * было, и в счёт ходов не идёт.
   */
  private detectBattle(position: Position): Outcome | null {
    let current = position;

    for (let guard = 0; guard <= current.sides.length; guard++) {
      if (legalMoves(current).length > 0) break;

      current = inCheck(current, current.turn)
        ? knockOut(current, current.turn)
        : { ...current, turn: nextSide(current, current.turn) };
    }
    if (current !== position) this.replace(current);

    const standing = current.sides.flatMap((_, side) =>
      alive(current, side) ? [side] : [],
    );
    const winner = standing[0];
    if (standing.length === 1 && winner !== undefined) {
      return this.finish(winner, "lastStanding");
    }

    return null;
  }

  /**
   * Уйти из битвы: сдался, не успел с ходом или бросил стол. Фигуры уходят с
   * доски, партия продолжается без него.
   */
  retire(side: Side): Outcome | null {
    if (this.ended) return null;
    if (!alive(this.top.position, side)) return null;

    this.replace(knockOut(this.top.position, side));
    return this.detect();
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

import {
  fileLetter,
  fileOf,
  offset,
  rankOf,
  squareAt,
  squareName,
  type Geometry,
  type Vec,
} from "./geometry";
import {
  PROMOTIONS,
  markKey,
  marked,
  patternOf,
  piece,
  type Piece,
  type PieceKind,
  type Side,
} from "./pieces";
import {
  ZOMBIE_DELAY,
  kingIsRoyal,
  nextSide,
  type CastleRight,
  type Position,
  type Zombie,
} from "./position";

/**
 * Ходы: какие есть, законен ли, что будет после.
 *
 * Схема обычная для шахматных программ: сначала все ходы по виду фигур, потом
 * отсев тех, после которых свой король под боем. Отсев честный — ход делается
 * на копии доски и проверяется, — поэтому связки, вскрытые шахи и взятие на
 * проходе со вскрытием горизонтали ловятся без отдельных правил.
 */

/**
 * Откуда идёт выставленная из резерва: ниоткуда. Номером клетки, а не
 * отдельным полем, — так ход остаётся одной формы, и всё, что перебирает
 * ходы, о резерве не думает.
 */
export const DROP = -1;

export interface Move {
  /** Клетка, с которой идут; `DROP` — фигура пришла из резерва. */
  readonly from: number;
  readonly to: number;
  readonly piece: Piece;
  /** Кого забирают. `null` — никого. */
  readonly captured: Piece | null;
  /** Где стоит забираемый: при взятии на проходе — не там, куда идут. */
  readonly capturedAt: number | null;
  readonly promotion: PieceKind | null;
  /** Рокировка: какое право ею используется. */
  readonly castle: CastleRight | null;
  /** Пешка идёт на два поля — после хода её можно взять на проходе. */
  readonly doubleStep: boolean;
  readonly enPassant: boolean;
}

type Board = readonly (Piece | null)[];

function at(board: Board, square: number): Piece | null {
  return board[square] ?? null;
}

/** Где у стороны её первая, вторая и последняя линии. */
function pawnLines(geometry: Geometry, [dx, dy]: Vec) {
  const alongFiles = dx !== 0;
  const direction = alongFiles ? dx : dy;
  const size = alongFiles ? geometry.width : geometry.height;
  const back = direction > 0 ? 0 : size - 1;

  return {
    coordinate: (square: number) =>
      alongFiles ? fileOf(geometry, square) : rankOf(geometry, square),
    first: back,
    second: back + direction,
    last: direction > 0 ? size - 1 : 0,
  };
}

/**
 * Ходит ли фигура по этому вектору. В пацанских шахматах назад не ходят: из
 * восьми направлений остаются пять, и это одно правило на всю таблицу
 * (docs/MODES.md, режим 6).
 */
function allowed(position: Position, mover: Piece, [vx, vy]: Vec): boolean {
  if (!position.rules.forwardOnly) return true;

  const forward = position.sides[mover.side]?.forward;
  if (!forward) return true;

  return vx * forward[0] + vy * forward[1] >= 0;
}

/** Клетка на первой горизонтали соперника — там же, где превращается пешка. */
export function reachedThrone(
  position: Position,
  side: Side,
  square: number,
): boolean {
  const forward = position.sides[side]?.forward;
  if (!forward) return false;

  const lines = pawnLines(position.geometry, forward);
  return lines.coordinate(square) === lines.last;
}

/** Куда пешка бьёт вбок от своего хода вперёд. */
function sideways([dx]: Vec): readonly Vec[] {
  return dx !== 0
    ? [
        [0, 1],
        [0, -1],
      ]
    : [
        [1, 0],
        [-1, 0],
      ];
}

function basic(
  from: number,
  to: number,
  mover: Piece,
  captured: Piece | null,
  extra: Partial<Move> = {},
): Move {
  return {
    from,
    to,
    piece: mover,
    captured,
    capturedAt: captured ? to : null,
    promotion: null,
    castle: null,
    doubleStep: false,
    enPassant: false,
    ...extra,
  };
}

function pawnMoves(
  position: Position,
  from: number,
  pawn: Piece,
  moves: Move[],
): void {
  const { geometry, board } = position;
  const forward = position.sides[pawn.side]?.forward;
  if (!forward) return;
  const lines = pawnLines(geometry, forward);

  const push = (to: number, captured: Piece | null, extra: Partial<Move>) => {
    // В мега-шахматах превращения нет вовсе: дойдя, пешка станет мега-пешкой.
    if (!position.rules.mega && lines.coordinate(to) === lines.last) {
      for (const promotion of PROMOTIONS) {
        moves.push(basic(from, to, pawn, captured, { ...extra, promotion }));
      }
    } else {
      moves.push(basic(from, to, pawn, captured, extra));
    }
  };

  const one = offset(geometry, from, forward);
  if (one !== null && !at(board, one)) {
    push(one, null, {});

    const two = offset(geometry, from, forward, 2);
    if (
      two !== null &&
      lines.coordinate(from) === lines.second &&
      !at(board, two)
    ) {
      moves.push(basic(from, two, pawn, null, { doubleStep: true }));
    }
  }

  for (const [sx, sy] of sideways(forward)) {
    const to = offset(geometry, from, [forward[0] + sx, forward[1] + sy]);
    if (to === null) continue;

    const target = at(board, to);
    if (target && target.side !== pawn.side) {
      push(to, target, {});
      continue;
    }

    const passant = position.enPassant;
    if (!target && passant && passant.target === to) {
      const victim = at(board, passant.victim);
      if (victim && victim.kind === "p" && victim.side !== pawn.side) {
        moves.push({
          ...basic(from, to, pawn, victim),
          capturedAt: passant.victim,
          enPassant: true,
        });
      }
    }
  }
}

/**
 * Мега-пешка: ходит на одну клетку вперёд и назад, бьёт по диагонали в обе
 * стороны (docs/MODES.md, режим 4). Ни двойного шага, ни взятия на проходе,
 * ни превращения у неё нет — она уже дошла.
 */
function megaPawnMoves(
  position: Position,
  from: number,
  pawn: Piece,
  moves: Move[],
): void {
  const { geometry, board } = position;
  const forward = position.sides[pawn.side]?.forward;
  if (!forward) return;
  const back: Vec = [-forward[0], -forward[1]];

  for (const straight of [forward, back]) {
    const to = offset(geometry, from, straight);
    if (to !== null && !at(board, to) && allowed(position, pawn, straight)) {
      moves.push(basic(from, to, pawn, null));
    }

    for (const [sx, sy] of sideways(straight)) {
      const vec: Vec = [straight[0] + sx, straight[1] + sy];
      if (!allowed(position, pawn, vec)) continue;

      const beat = offset(geometry, from, vec);
      if (beat === null) continue;
      const target = at(board, beat);
      if (target && target.side !== pawn.side) {
        moves.push(basic(from, beat, pawn, target));
      }
    }
  }
}

function pieceMoves(
  position: Position,
  from: number,
  mover: Piece,
  moves: Move[],
): void {
  if (mover.kind === "p") return;
  const { geometry, board } = position;
  const pattern = patternOf(mover);

  for (const vec of pattern.leaps) {
    if (!allowed(position, mover, vec)) continue;
    const to = offset(geometry, from, vec);
    if (to === null) continue;
    const target = at(board, to);
    if (target?.side === mover.side) continue;
    moves.push(basic(from, to, mover, target));
  }

  for (const vec of pattern.slides) {
    if (!allowed(position, mover, vec)) continue;
    for (let times = 1; ; times++) {
      const to = offset(geometry, from, vec, times);
      if (to === null) break;
      const target = at(board, to);
      if (target?.side === mover.side) break;
      moves.push(basic(from, to, mover, target));
      if (target) break;
    }
  }

  // Пушка: то же направление, но с правом перепрыгнуть ровно одну фигуру.
  // До преграды клетки уже дал обычный луч, здесь — то, что за ней.
  for (const vec of pattern.hops ?? []) {
    if (!allowed(position, mover, vec)) continue;
    let jumped = false;
    for (let times = 1; ; times++) {
      const to = offset(geometry, from, vec, times);
      if (to === null) break;

      const target = at(board, to);
      if (!target) {
        if (jumped) moves.push(basic(from, to, mover, null));
        continue;
      }
      if (jumped) {
        if (target.side !== mover.side) {
          moves.push(basic(from, to, mover, target));
        }
        break;
      }
      jumped = true;
    }
  }
}

/**
 * Рокировки стороны, чья очередь. Правило общее и для обычных шахмат, и для
 * любой расстановки: между королём, ладьёй и местами, куда они встают, пусто
 * (кроме их самих), король не под шахом и не проходит через битое поле.
 *
 * Битые поля проверяются только там, где король королевский. Где шаха нет
 * вовсе — «на уничтожение», — рокироваться можно и под боем, и через удар:
 * лишь бы дорога была свободна. Так решил хозяин (docs/MODES.md, режим 3).
 */
function castleMoves(position: Position, moves: Move[]): void {
  const { geometry, board, turn } = position;

  for (const right of position.castling) {
    if (right.side !== turn) continue;
    const king = at(board, right.king);
    const rook = at(board, right.rook);
    if (king?.kind !== "k" || king.side !== turn) continue;
    if (rook?.kind !== "r" || rook.side !== turn) continue;

    const y = rankOf(geometry, right.king);
    const files = [right.king, right.rook, right.kingTo, right.rookTo].map(
      (square) => fileOf(geometry, square),
    );
    let blocked = false;
    for (let x = Math.min(...files); x <= Math.max(...files); x++) {
      const square = squareAt(geometry, x, y);
      if (square !== right.king && square !== right.rook && at(board, square)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    if (kingIsRoyal(position)) {
      const from = fileOf(geometry, right.king);
      const to = fileOf(geometry, right.kingTo);
      const step = Math.sign(to - from);
      let safe = true;
      for (let x = from; ; x += step) {
        if (attacked(position, squareAt(geometry, x, y), turn)) {
          safe = false;
          break;
        }
        if (x === to || step === 0) break;
      }
      if (!safe) continue;
    }

    moves.push(basic(right.king, right.kingTo, king, null, { castle: right }));
  }
}

/**
 * Выставление из резерва: фигура встаёт на свободную клетку своих двух
 * стартовых горизонталей, и это ход (docs/MODES.md, режимы 2 и 14).
 *
 * Пешку на первую горизонталь не выставляют — как в крейзихаусе, откуда взята
 * механика: ходить ей оттуда было бы некуда назад, а вперёд она и так пойдёт.
 */
function dropMoves(position: Position, moves: Move[]): void {
  const { geometry, board, turn } = position;
  const kinds = new Set(position.reserve[turn] ?? []);
  if (kinds.size === 0) return;

  const forward = position.sides[turn]?.forward;
  if (!forward) return;
  const lines = pawnLines(geometry, forward);

  for (let to = 0; to < board.length; to++) {
    if (at(board, to)) continue;
    const line = lines.coordinate(to);
    if (line !== lines.first && line !== lines.second) continue;

    for (const kind of kinds) {
      if (kind === "p" && line === lines.first) continue;
      moves.push(basic(DROP, to, piece(kind, turn), null));
    }
  }
}

/** Все ходы стороны, чья очередь, по виду фигур — без проверки своего короля. */
export function pseudoMoves(position: Position): Move[] {
  const moves: Move[] = [];

  position.board.forEach((mover, from) => {
    if (!mover) return;
    // Свои фигуры — и чужой двойной агент: им ходит соперник, и это его ход
    // (docs/MODES.md, режим 10).
    if (mover.side !== position.turn && !mover.agent) return;

    if (mover.kind !== "p") pieceMoves(position, from, mover, moves);
    else if (mover.mega) megaPawnMoves(position, from, mover, moves);
    else pawnMoves(position, from, mover, moves);
  });
  castleMoves(position, moves);
  dropMoves(position, moves);

  return moves;
}

/** Сколько шагов вектора до цели; ноль — цель не на этом луче. */
function stepsAlong(dx: number, dy: number, [vx, vy]: Vec): number {
  const times = vx !== 0 ? dx / vx : dy / vy;
  if (!Number.isInteger(times) || times <= 0) return 0;
  return dx === vx * times && dy === vy * times ? times : 0;
}

/** Бьёт ли эта фигура с этой клетки по цели. */
function hits(
  position: Position,
  board: Board,
  from: number,
  attacker: Piece,
  target: number,
): boolean {
  const { geometry } = position;
  const dx = fileOf(geometry, target) - fileOf(geometry, from);
  const dy = rankOf(geometry, target) - rankOf(geometry, from);

  if (attacker.kind === "p") {
    const forward = position.sides[attacker.side]?.forward;
    if (!forward) return false;

    // Мега-пешка бьёт и назад: у неё четыре диагонали вместо двух.
    const ways: Vec[] = attacker.mega
      ? [forward, [-forward[0], -forward[1]]]
      : [forward];

    return ways.some((way) =>
      sideways(way).some(
        ([sx, sy]) =>
          dx === way[0] + sx &&
          dy === way[1] + sy &&
          allowed(position, attacker, [dx, dy]),
      ),
    );
  }

  const pattern = patternOf(attacker);
  if (
    pattern.leaps.some(
      ([vx, vy]) =>
        dx === vx && dy === vy && allowed(position, attacker, [vx, vy]),
    )
  ) {
    return true;
  }

  for (const vec of pattern.slides) {
    if (!allowed(position, attacker, vec)) continue;
    const times = stepsAlong(dx, dy, vec);
    if (times === 0) continue;

    let clear = true;
    for (let step = 1; step < times; step++) {
      const between = offset(geometry, from, vec, step);
      if (between === null || at(board, between)) {
        clear = false;
        break;
      }
    }
    if (clear) return true;
  }

  // Пушка бьёт через ровно одну фигуру — не больше и не меньше.
  for (const vec of pattern.hops ?? []) {
    if (!allowed(position, attacker, vec)) continue;
    const times = stepsAlong(dx, dy, vec);
    if (times === 0) continue;

    let blockers = 0;
    for (let step = 1; step < times; step++) {
      const between = offset(geometry, from, vec, step);
      if (between !== null && at(board, between)) blockers++;
    }
    if (blockers === 1) return true;
  }

  return false;
}

/** Бьёт ли кто-нибудь, кроме этой стороны, по клетке. */
export function attacked(
  position: Position,
  square: number,
  defender: Side,
  board: Board = position.board,
): boolean {
  for (let from = 0; from < board.length; from++) {
    const attacker = at(board, from);
    if (!attacker || attacker.side === defender) continue;
    if (hits(position, board, from, attacker, square)) return true;
  }
  return false;
}

/**
 * Король этой стороны под боем. Нет короля — нет и шаха.
 *
 * Где цель партии не мат, шаха нет как понятия: король там обычная фигура,
 * которую бьют и которой подставляются. Отвечать «нет» одним местом дешевле,
 * чем помнить про это в отсеве ходов, в записи и в подсветке короля.
 */
export function inCheck(
  position: Position,
  side: Side,
  board: Board = position.board,
): boolean {
  if (!kingIsRoyal(position)) return false;

  for (let square = 0; square < board.length; square++) {
    const king = at(board, square);
    if (king?.kind === "k" && king.side === side) {
      if (attacked(position, square, side, board)) return true;
    }
  }
  return false;
}

/**
 * Чем фигура встаёт на клетку: превращённой, пробуждённым агентом или
 * мега-формой. Метки едут вместе с фигурой, так что дальше о них никто не
 * думает.
 */
function landing(position: Position, move: Move): Piece {
  let mover = move.promotion
    ? piece(move.promotion, move.piece.side)
    : move.piece;

  // Агент, которым сходил соперник, просыпается: дальше его видят все.
  if (mover.agent && !mover.awake && move.piece.side !== position.turn) {
    mover = marked(mover, { awake: true });
  }

  // Дошёл до первой горизонтали соперника — получил мега-форму. Король её не
  // получает: ему доходить незачем, он этим выигрывает (game.ts).
  if (
    position.rules.mega &&
    !mover.mega &&
    mover.kind !== "k" &&
    reachedThrone(position, mover.side, move.to)
  ) {
    mover = marked(mover, { mega: true });
  }

  return mover;
}

/** Доска после хода. */
function boardAfter(position: Position, move: Move): (Piece | null)[] {
  const board = position.board.slice();

  if (move.from !== DROP) board[move.from] = null;
  if (move.capturedAt !== null) board[move.capturedAt] = null;
  if (move.castle) {
    board[move.castle.rook] = null;
    board[move.castle.rookTo] = piece("r", move.piece.side);
  }
  board[move.to] = landing(position, move);

  return board;
}

/**
 * Законные ходы стороны, чья очередь.
 *
 * Сначала отсев по своему королю — он сам собой пропадает там, где короля не
 * берегут. Потом обязательное взятие поддавков: есть чем взять — только
 * взятия и остаются, а каким из них брать, игрок выбирает сам
 * (docs/MODES.md, режим 11).
 */
export function legalMoves(position: Position): Move[] {
  const banned = position.banned;
  const moves = pseudoMoves(position).filter(
    (move) =>
      !inCheck(position, position.turn, boardAfter(position, move)) &&
      // Отменённый «НЕТ» ход повторять нельзя: соперник обязан сходить иначе
      // (docs/MODES.md, режим 15).
      !(
        banned !== null &&
        banned.from === move.from &&
        banned.to === move.to &&
        banned.promotion === move.promotion
      ),
  );
  if (!position.rules.mustCapture) return moves;

  const captures = moves.filter((move) => move.captured);
  return captures.length > 0 ? captures : moves;
}

/**
 * Резерв и очередь зомби после хода.
 *
 * Три хода отсчитываются по ходам того, кто срубил: так понятнее по счётчику
 * у полки. Свежесрубленная в этом же ходу не считается — иначе первый же ход
 * после взятия съедал бы у неё ход ожидания.
 */
function reserveAfter(position: Position, move: Move) {
  const mover = position.turn;
  const reserve = position.reserve.map((list) => [...list]);
  const pending: Zombie[] = [];

  if (move.from === DROP) {
    const own = reserve[mover];
    const at = own?.indexOf(move.piece.kind) ?? -1;
    if (own && at >= 0) own.splice(at, 1);
  }

  for (const zombie of position.pending) {
    const left = zombie.side === mover ? zombie.left - 1 : zombie.left;
    if (left <= 0) reserve[zombie.side]?.push(zombie.kind);
    else pending.push({ ...zombie, left });
  }

  // Король не зомбируется никогда: его берут только там, где мата нет, и
  // возвращать его на доску было бы вторым королём.
  if (position.rules.zombies && move.captured && move.captured.kind !== "k") {
    pending.push({
      kind: move.captured.kind,
      side: mover,
      left: ZOMBIE_DELAY,
    });
  }

  return { reserve, pending };
}

/** Позиция после хода. Ход должен быть из `legalMoves`. */
export function play(position: Position, move: Move): Position {
  // Ходит сторона, чья очередь: чужим двойным агентом ходит соперник, и
  // очередь после этого всё равно переходит к хозяину агента.
  const mover = position.turn;
  const forward = position.sides[move.piece.side]?.forward;

  return {
    ...position,
    ...reserveAfter(position, move),
    board: boardAfter(position, move),
    turn: nextSide(position, mover),
    // Король сходил — сгорают все права его стороны; ладья ушла или её
    // забрали — сгорает право с этой ладьёй.
    castling: position.castling.filter(
      (right) =>
        !(move.piece.kind === "k" && right.side === move.piece.side) &&
        right.rook !== move.from &&
        right.rook !== move.to,
    ),
    enPassant:
      move.doubleStep && forward
        ? {
            target: offset(position.geometry, move.from, forward) ?? move.to,
            victim: move.to,
          }
        : null,
    quiet: move.piece.kind === "p" || move.captured ? 0 : position.quiet + 1,
    sinceCapture: move.captured ? 0 : position.sinceCapture + 1,
    // Запрет живёт ровно один ход: сходили иначе — и он снят.
    banned: null,
    taken: move.captured
      ? position.taken.map((list, side) =>
          side === mover && move.captured ? [...list, move.captured] : list,
        )
      : position.taken,
  };
}

const LETTER: Readonly<Record<PieceKind, string>> = {
  p: "",
  n: "N",
  b: "B",
  r: "R",
  q: "Q",
  k: "K",
};

/**
 * Запись хода: `e4`, `Nbd2`, `exd6`, `e8=Q+`, `O-O-O#`.
 *
 * Считается от законных ходов позиции: уточнение, какой из двух коней пошёл,
 * нужно только тогда, когда второй конь тоже может туда законно пойти.
 */
export function san(
  position: Position,
  move: Move,
  legal: readonly Move[] = legalMoves(position),
): string {
  const { geometry } = position;
  let text: string;

  if (move.from === DROP) {
    // Как в крейзихаусе: «Q@d5», у пешки буква тоже пишется.
    text = `${move.piece.kind === "p" ? "P" : LETTER[move.piece.kind]}@${squareName(geometry, move.to)}`;
  } else if (move.castle) {
    text =
      fileOf(geometry, move.castle.rook) > fileOf(geometry, move.castle.king)
        ? "O-O"
        : "O-O-O";
  } else if (move.piece.kind === "p") {
    text = move.captured
      ? `${fileLetter(geometry, move.from)}x${squareName(geometry, move.to)}`
      : squareName(geometry, move.to);
    if (move.promotion) text += `=${LETTER[move.promotion]}`;
  } else {
    const rivals = legal.filter(
      (other) =>
        other.piece.kind === move.piece.kind &&
        other.to === move.to &&
        other.from !== move.from &&
        !other.castle,
    );
    let hint = "";
    if (rivals.length > 0) {
      const file = fileOf(geometry, move.from);
      const rank = rankOf(geometry, move.from);
      if (!rivals.some((other) => fileOf(geometry, other.from) === file)) {
        hint = fileLetter(geometry, move.from);
      } else if (
        !rivals.some((other) => rankOf(geometry, other.from) === rank)
      ) {
        hint = String(rank + 1);
      } else {
        hint = squareName(geometry, move.from);
      }
    }
    text = `${LETTER[move.piece.kind]}${hint}${move.captured ? "x" : ""}${squareName(geometry, move.to)}`;
  }

  const after = play(position, move);
  if (inCheck(after, after.turn)) {
    text += legalMoves(after).length === 0 ? "#" : "+";
  }
  return text;
}

/**
 * Ключ позиции для повторений — по ФИДЕ: та же сторона ходит, те же фигуры на
 * тех же полях, те же права рокировки и та же возможность взять на проходе.
 *
 * Поле взятия на проходе входит в ключ, только если такое взятие законно:
 * пешка, прошедшая на два поля мимо пустоты, позицию не меняет.
 */
export function repetitionKey(position: Position): string {
  const board = position.board
    .map((cell) => (cell ? `${cell.kind}${cell.side}${markKey(cell)}` : "."))
    .join("");
  const castling = position.castling
    .map((right) => `${right.king}>${right.rook}`)
    .sort()
    .join(",");
  const passant =
    position.enPassant && legalMoves(position).some((move) => move.enPassant)
      ? String(position.enPassant.target)
      : "-";
  // Резерв и очередь зомби — часть позиции: с теми же фигурами на доске, но
  // с ферзём в кармане это другая позиция, и повторением она не считается.
  const reserve = position.reserve
    .map((list) => [...list].sort().join(""))
    .join("/");
  const pending = position.pending
    .map((zombie) => `${zombie.kind}${zombie.side}${zombie.left}`)
    .sort()
    .join(",");

  return `${board}|${position.turn}|${castling}|${passant}|${reserve}|${pending}`;
}

/** Цвет поля: слоны на полях одного цвета доску не покрывают. */
function squareShade(geometry: Geometry, square: number): number {
  return (fileOf(geometry, square) + rankOf(geometry, square)) % 2;
}

/**
 * Мата не поставить ни одному, ни другому: король против короля, король с
 * одной лёгкой фигурой против короля, короли со слонами на полях одного цвета.
 *
 * Правило то же, что у `chess.js`, которым шахматы кончают партию: два коня
 * или конь против коня недостаточными не считаются — мат ими возможен, хоть и
 * не форсируется.
 */
export function insufficientMaterial(position: Position): boolean {
  // С резервом и очередью зомби материал ещё придёт: голые короли на доске
  // ничего не значат, пока у кого-то в кармане ферзь.
  if (position.reserve.some((list) => list.length > 0)) return false;
  if (position.pending.length > 0) return false;

  const pieces: { kind: PieceKind; square: number }[] = [];
  position.board.forEach((cell, square) => {
    if (cell) pieces.push({ kind: cell.kind, square });
  });

  if (pieces.length === 2) return true;

  const minors = pieces.filter(({ kind }) => kind === "b" || kind === "n");
  if (pieces.length === 3 && minors.length === 1) return true;

  const bishops = pieces.filter(({ kind }) => kind === "b");
  if (bishops.length > 0 && pieces.length === bishops.length + 2) {
    const shades = new Set(
      bishops.map(({ square }) => squareShade(position.geometry, square)),
    );
    return shades.size === 1;
  }

  return false;
}

/**
 * Может ли эта сторона в принципе поставить мат — вопрос при упавшем флаге.
 *
 * Матовать нечем с голым королём, с одной лёгкой фигурой и с любым числом
 * слонов на полях одного цвета. Два коня достаточны: мат ими возможен. Так же
 * решено у шахмат и так же делают площадки.
 */
export function canMate(position: Position, side: Side): boolean {
  // Тем, кому есть что выставить, матовать есть чем — хоть и не сразу.
  if ((position.reserve[side]?.length ?? 0) > 0) return true;
  if (position.pending.some((zombie) => zombie.side === side)) return true;

  const own: { kind: PieceKind; square: number }[] = [];
  position.board.forEach((cell, square) => {
    if (cell && cell.side === side) own.push({ kind: cell.kind, square });
  });

  if (own.some(({ kind }) => kind === "p" || kind === "r" || kind === "q")) {
    return true;
  }

  const knights = own.filter(({ kind }) => kind === "n").length;
  const bishops = own.filter(({ kind }) => kind === "b");
  if (knights >= 2 || (knights >= 1 && bishops.length >= 1)) return true;
  if (knights >= 1) return false;

  const shades = new Set(
    bishops.map(({ square }) => squareShade(position.geometry, square)),
  );
  return shades.size > 1;
}

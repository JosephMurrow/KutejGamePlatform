import { fileOf, offset, rankOf, squareAt } from "../engine/geometry";
import {
  firstLine,
  inCheck,
  pseudoMoves,
  reachedThrone,
} from "../engine/moves";
import { piece, type Piece, type PieceKind, type Side } from "../engine/pieces";
import {
  bent,
  classicPosition,
  type Effect,
  type EffectKind,
  type Position,
} from "../engine/position";

/**
 * Режим 12, «Загул» (docs/MODES.md): после каждого взятия срубивший тянет
 * случайное событие из колоды того ранга, чью фигуру он срубил.
 *
 * Своего у режима не правила ходов, а то, что случается между ходами: колода,
 * розыгрыш и правка позиции мимо хода. Поэтому в позиции у загула нет ни одного
 * своего поля — доску правит событие, а движок узнаёт о ней через тот же
 * фасад, которым правит доску алко-штраф.
 *
 * Кости бросает **сервер** по зерну партии и передаёт сюда броском-функцией:
 * с тем же зерном партия повторится клетка в клетку (docs/SPEC.md, раздел 4).
 */

/**
 * Сколько карточка события висит во весь экран. Пара секунд, как в постановке:
 * прочитать название и строку правил — и хватит. Часы хода на это время стоят.
 */
export const BINGE_CARD_MS = 2_500;

/**
 * Сколько событий у режима по постановке. Написаны пока не все: остальные
 * доезжают подэтапами этого же этапа, и до тех пор карточка правил говорит об
 * этом прямо — обещать двадцать восемь и дать половину нечестно.
 */
export const BINGE_TOTAL = 28;

/** Ранг колоды: у каждого — свои события и своя цена входа. */
export type BingeRank = "pawn" | "minor" | "rook" | "queen";

/** Порядок колод от мелкой к переворотной: им они и показываются игроку. */
export const BINGE_RANKS: readonly BingeRank[] = [
  "pawn",
  "minor",
  "rook",
  "queen",
];

export const BINGE_RANK_LABEL: Record<BingeRank, string> = {
  pawn: "за пешку",
  minor: "за коня или слона",
  rook: "за ладью",
  queen: "за ферзя",
};

/** Событие таким, каким его видит игрок: карточка во весь экран. */
export interface BingeEvent {
  readonly id: string;
  readonly rank: BingeRank;
  readonly title: string;
  /** Одна строка правил — та, что на карточке. */
  readonly text: string;
}

/**
 * Что событию нужно знать про стол сверх позиции.
 *
 * Позиция не помнит, кто чем ходил, и ничего не знает про часы — а «Похмелью»
 * нужна фигура, которой соперник ходил в прошлый раз, «Сушняку» — есть ли
 * вообще что резать. Двух полей хватает, и растить их без нужды не надо:
 * стол — не второй источник правды, а справка.
 */
export interface BingeTable {
  /**
   * Клетка, на которой стоит фигура, ходившая соперником в прошлый раз;
   * `null` — он ещё не ходил.
   */
  readonly enemyMoved: number | null;
  /** Есть ли лимит на ход: в безлимитной комнате «Сушняку» нечего резать. */
  readonly timed: boolean;
}

/** Стол, о котором ничего не известно: так события зовут из проверок. */
export const BARE_TABLE: BingeTable = { enemyMoved: null, timed: true };

/**
 * Что событие делает с позицией; `null` — в этой позиции делать нечего.
 *
 * Такая карта **сгорает впустую**: показывается с пометкой «мимо» и выбывает
 * из колоды, как сыгравшая. Так решил хозяин в начале этапа — рулетка так
 * рулетка.
 */
type Play = (
  position: Position,
  side: Side,
  roll: () => number,
  table: BingeTable,
) => Position | null;

interface Card extends BingeEvent {
  readonly play: Play;
}

/** Сколько карт всего в колоде ранга — по ним считается «осталось». */
export type BingeDecks = Record<BingeRank, string[]>;

/** Соперник за столом. В загуле их всегда двое: режим на двоих. */
function rival(position: Position, side: Side): Side {
  return position.sides.findIndex((_, seat) => seat !== side);
}

/**
 * На сколько линий клетка отстоит от своей первой горизонтали. По этому числу
 * считается и своя половина доски, и «кто впереди»: сторона смотрит туда, куда
 * ходят её пешки, и у четырёх сторон битвы это была бы вертикаль.
 */
function depthOf(
  position: Position,
  side: Side,
  square: number,
): number | null {
  const forward = position.sides[side]?.forward;
  if (!forward) return null;

  const [dx, dy] = forward;
  const { geometry } = position;
  const along = dy !== 0 ? rankOf(geometry, square) : fileOf(geometry, square);
  const span = dy !== 0 ? geometry.height : geometry.width;
  const sign = dy !== 0 ? dy : dx;

  return sign > 0 ? along : span - 1 - along;
}

/** Своя половина доски: туда встаёт лишняя пешка «Двоится». */
function ownHalf(position: Position, side: Side, square: number): boolean {
  const depth = depthOf(position, side, square);
  if (depth === null) return false;

  const { geometry } = position;
  const forward = position.sides[side]?.forward;
  const span = forward && forward[1] !== 0 ? geometry.height : geometry.width;

  return depth < span / 2;
}

/** Куда эта клетка смотрит вперёд; `null` — дальше доски нет. */
function ahead(position: Position, side: Side, square: number): number | null {
  const forward = position.sides[side]?.forward;
  if (!forward) return null;

  return offset(position.geometry, square, forward);
}

/** Пешке тут не место: своя первая горизонталь и чужая, где она превращалась бы. */
function pawnBanned(
  position: Position,
  side: Side,
  square: number,
  kind: PieceKind,
): boolean {
  if (kind !== "p") return false;

  return (
    firstLine(position, side, square) || reachedThrone(position, side, square)
  );
}

/** Случайное из списка по броску; пусто — ничего. */
function pick<T>(list: readonly T[], roll: () => number): T | undefined {
  if (list.length === 0) return undefined;

  return list[Math.min(list.length - 1, Math.floor(roll() * list.length))];
}

/** Клетки, где стоят фигуры стороны. */
function squaresOf(
  position: Position,
  side: Side,
  keep: (mover: Piece) => boolean = () => true,
): number[] {
  return position.board.flatMap((cell, square) =>
    cell && cell.side === side && keep(cell) ? [square] : [],
  );
}

/** Свободные клетки доски. */
function empties(position: Position): number[] {
  return position.board.flatMap((cell, square) => (cell ? [] : [square]));
}

/**
 * Позиция после того, как событие переставило фигуры.
 *
 * Права рокировки пересчитываются по доске: событие, уволокшее короля или
 * ладью с их клетки, эти права гасит. Взятие на проходе снимается всегда —
 * пешка, мимо которой били, после события стоит уже не там, где била бы.
 */
function reshaped(
  position: Position,
  board: readonly (Piece | null)[],
): Position {
  return {
    ...position,
    board,
    enPassant: null,
    castling: position.castling.filter((right) => {
      const king = board[right.king];
      const rook = board[right.rook];

      return (
        king?.kind === "k" &&
        king.side === right.side &&
        rook?.kind === "r" &&
        rook.side === right.side
      );
    }),
  };
}

/**
 * Очередь остаётся за тянувшим ещё на столько ходов.
 *
 * Ход, которым тянули карту, уже сделан и очередь уже ушла, поэтому первый
 * лишний ход — это просто возврат очереди, а остальные ложатся в тот же банк,
 * которым живёт купленный на рынке дополнительный ход.
 */
function again(position: Position, side: Side, moves: number): Position {
  const spare = position.turn === side ? moves : moves - 1;

  return {
    ...position,
    turn: side,
    extra: position.sides.map(
      (_, seat) =>
        (position.extra[seat] ?? 0) + (seat === side ? Math.max(0, spare) : 0),
    ),
  };
}

/**
 * Шаг вперёд всем, кому есть куда: сначала самые продвинувшиеся, иначе
 * задний упирался бы в переднего и шеренга не двигалась бы вовсе. Отвечает,
 * сдвинулся ли хоть кто-то: если никто, событию засчитывается «мимо».
 */
function stepForward(
  board: (Piece | null)[],
  position: Position,
  side: Side,
  keep: (mover: Piece) => boolean,
): boolean {
  const line = squaresOf(position, side, keep).sort(
    (one, other) =>
      (depthOf(position, side, other) ?? 0) -
      (depthOf(position, side, one) ?? 0),
  );

  let moved = false;
  for (const from of line) {
    const mover = board[from];
    if (!mover) continue;

    const to = ahead(position, side, from);
    if (to === null || board[to]) continue;
    // Превращений событие не даёт: пешка перед последней горизонталью стоит.
    if (pawnBanned(position, side, to, mover.kind)) continue;

    board[to] = mover;
    board[from] = null;
    moved = true;
  }

  return moved;
}

/**
 * Событие, которое не двигает фигуры, а гнёт правила: оно кладёт в позицию
 * действующий эффект, а движок дальше сам решает, что с ним делать. Вернуло
 * `null` — гнуть нечего, и карта сгорает впустую.
 */
function bends(
  make: (position: Position, side: Side, table: BingeTable) => Effect | null,
): Play {
  return (position, side, _roll, table) => {
    const effect = make(position, side, table);
    if (!effect) return null;

    return { ...position, effects: [...position.effects, effect] };
  };
}

const CARDS: readonly Card[] = [
  {
    id: "rush",
    rank: "pawn",
    title: "Разгон",
    text: "Пешки обеих сторон ходят на три клетки. Два хода.",
    play: bends(() => ({ kind: "rush", side: null, left: 2 })),
  },
  {
    id: "hangover",
    rank: "pawn",
    title: "Похмелье",
    text: "Соперник обязан ходить той же фигурой, что и в прошлый раз.",
    play: bends((position, side, table) => {
      const enemy = rival(position, side);
      const square = table.enemyMoved;
      if (enemy < 0 || square === null) return null;
      // Той фигуры может уже не быть: её этим ходом и срубили.
      if (position.board[square]?.side !== enemy) return null;

      return { kind: "hangover", side: enemy, left: 1, square };
    }),
  },
  {
    id: "tremor",
    rank: "pawn",
    title: "Тремор",
    text: "Доска развёрнута на сто восемьдесят градусов — обоим. Два хода.",
    play: bends(() => ({ kind: "tremor", side: null, left: 2 })),
  },
  {
    id: "blind",
    rank: "pawn",
    title: "Слепота",
    text: "Сопернику на один ход не подсвечиваются ходы.",
    play: bends((position, side) => {
      const enemy = rival(position, side);
      return enemy < 0 ? null : { kind: "blind", side: enemy, left: 1 };
    }),
  },
  {
    id: "stagger",
    rank: "pawn",
    title: "Заплетается",
    text: "Пешки обеих сторон ходят вбок на одну клетку без взятия. Два хода.",
    play: bends(() => ({ kind: "stagger", side: null, left: 2 })),
  },
  {
    id: "thirst",
    rank: "pawn",
    title: "Сушняк",
    text: "У соперника меньше времени на ближайший ход.",
    play: bends((position, side, table) => {
      const enemy = rival(position, side);
      // Часов нет — резать нечего, и карта сгорает впустую.
      if (enemy < 0 || !table.timed) return null;

      return { kind: "thirst", side: enemy, left: 1 };
    }),
  },
  {
    id: "skid",
    rank: "minor",
    title: "Занос",
    text: "Кони ходят как слоны, слоны — как кони. Один ход.",
    play: bends((position) => {
      const spun = position.board.some(
        (cell) => cell?.kind === "n" || cell?.kind === "b",
      );
      return spun ? { kind: "skid", side: null, left: 1 } : null;
    }),
  },
  {
    id: "swagger",
    rank: "minor",
    title: "Кураж",
    text: "Следующее твоё взятие даёт дополнительный ход.",
    play: bends((_position, side) => ({ kind: "swagger", side, left: 1 })),
  },
  {
    id: "closed",
    rank: "minor",
    title: "Кабак закрыт",
    text: "Два хода без рокировки и без взятия на проходе.",
    play: bends(() => ({ kind: "closed", side: null, left: 2 })),
  },
  {
    id: "double",
    rank: "pawn",
    title: "Двоится",
    text: "На случайной свободной клетке твоей половины появляется лишняя пешка.",
    play: (position, side, roll) => {
      const free = empties(position).filter(
        (square) =>
          ownHalf(position, side, square) &&
          !pawnBanned(position, side, square, "p"),
      );
      const at = pick(free, roll);
      if (at === undefined) return null;

      const board = position.board.slice();
      board[at] = piece("p", side);

      return reshaped(position, board);
    },
  },
  {
    id: "secondWind",
    rank: "pawn",
    title: "Второе дыхание",
    text: "Ходишь ещё раз.",
    play: (position, side) => again(position, side, 1),
  },
  {
    id: "mistaken",
    rank: "pawn",
    title: "Обознался",
    text: "Две твои случайные пешки меняются местами.",
    play: (position, side, roll) => {
      const pawns = squaresOf(position, side, (mover) => mover.kind === "p");
      const one = pick(pawns, roll);
      const other = pick(
        pawns.filter((square) => square !== one),
        roll,
      );
      if (one === undefined || other === undefined) return null;

      const board = position.board.slice();
      board[one] = position.board[other] ?? null;
      board[other] = position.board[one] ?? null;

      return reshaped(position, board);
    },
  },
  {
    id: "brawl",
    rank: "minor",
    title: "Дебош",
    text: "Случайная фигура соперника сдвигается на случайную доступную ей клетку.",
    play: (position, side, roll) => {
      const enemy = rival(position, side);
      if (enemy < 0) return null;

      // Двигается фигура соперника — значит и ходы считаются его очередью.
      // Взятия и рокировки не в счёт: дебош переставляет, а не режет.
      const moves = pseudoMoves({ ...position, turn: enemy }).filter(
        (move) =>
          move.captured === null &&
          move.castle === null &&
          move.from >= 0 &&
          !pawnBanned(position, enemy, move.to, move.piece.kind),
      );
      const move = pick(moves, roll);
      if (!move) return null;

      const board = position.board.slice();
      board[move.to] = position.board[move.from] ?? null;
      board[move.from] = null;

      return reshaped(position, board);
    },
  },
  {
    id: "wall",
    rank: "minor",
    title: "Стенка на стенку",
    text: "Все пешки обеих сторон делают шаг вперёд, если могут.",
    play: (position, side) => {
      const enemy = rival(position, side);
      const board = position.board.slice();
      const pawn = (mover: Piece) => mover.kind === "p";

      const mine = stepForward(board, position, side, pawn);
      const theirs = enemy >= 0 && stepForward(board, position, enemy, pawn);
      if (!mine && !theirs) return null;

      return reshaped(position, board);
    },
  },
  {
    id: "carousel",
    rank: "minor",
    title: "Карусель",
    text: "Все кони и слоны на доске меняются видом.",
    play: (position) => {
      const spun = position.board.some(
        (cell) => cell?.kind === "n" || cell?.kind === "b",
      );
      if (!spun) return null;

      const board = position.board.map((cell) =>
        cell && (cell.kind === "n" || cell.kind === "b")
          ? {
              ...cell,
              kind: cell.kind === "n" ? ("b" as const) : ("n" as const),
            }
          : cell,
      );

      return reshaped(position, board);
    },
  },
  {
    id: "lost",
    rank: "minor",
    title: "Не помню как тут оказался",
    text: "Твоя случайная фигура телепортируется на случайную свободную клетку.",
    play: (position, side, roll) => {
      // Короля событие не трогает: телепорт под бой кончал бы партию броском
      // костей, а не игрой.
      const from = pick(
        squaresOf(position, side, (mover) => mover.kind !== "k"),
        roll,
      );
      if (from === undefined) return null;

      const mover = position.board[from];
      if (!mover) return null;

      const to = pick(
        empties(position).filter(
          (square) => !pawnBanned(position, side, square, mover.kind),
        ),
        roll,
      );
      if (to === undefined) return null;

      const board = position.board.slice();
      board[to] = mover;
      board[from] = null;

      return reshaped(position, board);
    },
  },
  {
    id: "pogrom",
    rank: "rook",
    title: "Погром",
    text: "С доски исчезает случайная фигура соперника, кроме короля.",
    play: (position, side, roll) => {
      const enemy = rival(position, side);
      if (enemy < 0) return null;

      const at = pick(
        squaresOf(position, enemy, (mover) => mover.kind !== "k"),
        roll,
      );
      if (at === undefined) return null;

      const board = position.board.slice();
      board[at] = null;

      return reshaped(position, board);
    },
  },
  {
    id: "heist",
    rank: "rook",
    title: "Обнос",
    text: "Случайный угол доски два на два выжигается вместе с фигурами. Короля огонь не берёт.",
    play: (position, side, roll) => {
      const { geometry } = position;
      const corners = [
        [0, 0],
        [geometry.width - 2, 0],
        [0, geometry.height - 2],
        [geometry.width - 2, geometry.height - 2],
      ];
      const corner = pick(corners, roll);
      const x0 = corner?.[0];
      const y0 = corner?.[1];
      if (x0 === undefined || y0 === undefined) return null;

      const board = position.board.slice();
      let burnt = false;

      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 2; dy++) {
          const square = squareAt(geometry, x0 + dx, y0 + dy);
          const cell = board[square];
          if (!cell || cell.kind === "k") continue;

          board[square] = null;
          burnt = true;
        }
      }
      if (!burnt) return null;

      return reshaped(position, board);
    },
  },
  {
    id: "guard",
    rank: "rook",
    title: "Смена караула",
    text: "Король и случайная ладья соперника меняются местами.",
    play: (position, side, roll) => {
      const enemy = rival(position, side);
      if (enemy < 0) return null;

      const king = squaresOf(position, enemy, (mover) => mover.kind === "k")[0];
      const rook = pick(
        squaresOf(position, enemy, (mover) => mover.kind === "r"),
        roll,
      );
      if (king === undefined || rook === undefined) return null;

      const board = position.board.slice();
      board[king] = position.board[rook] ?? null;
      board[rook] = position.board[king] ?? null;

      return reshaped(position, board);
    },
  },
  {
    id: "floor",
    rank: "rook",
    title: "Танцпол",
    text: "Случайная вертикаль очищается от пешек обеих сторон.",
    play: (position, _side, roll) => {
      const { geometry } = position;
      const files = Array.from(
        { length: geometry.width },
        (_, file) => file,
      ).filter((file) =>
        position.board.some(
          (cell, square) =>
            cell?.kind === "p" && fileOf(geometry, square) === file,
        ),
      );
      const file = pick(files, roll);
      if (file === undefined) return null;

      const board = position.board.map((cell, square) =>
        cell?.kind === "p" && fileOf(geometry, square) === file ? null : cell,
      );

      return reshaped(position, board);
    },
  },
  {
    id: "spree",
    rank: "rook",
    title: "Разгуляй",
    text: "Два хода подряд.",
    play: (position, side) => again(position, side, 2),
  },
  {
    id: "solidarity",
    rank: "rook",
    title: "Круговая порука",
    text: "Все твои фигуры делают шаг вперёд, если могут. Король в шеренгу не встаёт.",
    play: (position, side) => {
      const board = position.board.slice();
      if (!stepForward(board, position, side, (mover) => mover.kind !== "k")) {
        return null;
      }

      return reshaped(position, board);
    },
  },
  {
    id: "spent",
    rank: "queen",
    title: "Всё пропил",
    text: "Обе стороны случайно теряют половину фигур. Короли остаются.",
    play: (position, _side, roll) => {
      const board = position.board.slice();
      let lost = false;

      position.sides.forEach((_, seat) => {
        const mine = squaresOf(position, seat, (mover) => mover.kind !== "k");
        const half = Math.floor(mine.length / 2);

        for (let taken = 0; taken < half; taken++) {
          const at = pick(
            mine.filter((square) => board[square]),
            roll,
          );
          if (at === undefined) break;

          board[at] = null;
          lost = true;
        }
      });
      if (!lost) return null;

      return reshaped(position, board);
    },
  },
];

const BY_ID = new Map(CARDS.map((card) => [card.id, card]));

/** События, какими их видит игрок: без машинерии. */
export const BINGE_EVENTS: readonly BingeEvent[] = CARDS.map(
  ({ id, rank, title, text }) => ({ id, rank, title, text }),
);

/** Из какой колоды тянут за эту фигуру; `null` — за короля не тянут вовсе. */
export function bingeRank(kind: PieceKind): BingeRank | null {
  switch (kind) {
    case "p":
      return "pawn";
    case "n":
    case "b":
      return "minor";
    case "r":
      return "rook";
    case "q":
      return "queen";
    default:
      return null;
  }
}

/**
 * Свежие колоды на партию: общие на двоих, как решено постановкой. Событие,
 * выпавшее одному, второму уже не выпадет.
 */
export function freshDecks(): BingeDecks {
  return {
    pawn: idsOf("pawn"),
    minor: idsOf("minor"),
    rook: idsOf("rook"),
    queen: idsOf("queen"),
  };
}

function idsOf(rank: BingeRank): string[] {
  return CARDS.filter((card) => card.rank === rank).map((card) => card.id);
}

/** Сколько карт осталось в каждой колоде — это видно обоим. */
export function bingeLeft(decks: BingeDecks): Record<BingeRank, number> {
  return {
    pawn: decks.pawn.length,
    minor: decks.minor.length,
    rook: decks.rook.length,
    queen: decks.queen.length,
  };
}

export interface BingeDeal {
  readonly event: BingeEvent;
  /** Позиция после события; `null` — карта сгорела впустую. */
  readonly position: Position | null;
}

/**
 * Взятие сыграно — тянем карту.
 *
 * Колода правится на месте: сыгравшая карта выбывает до конца партии, и
 * невыполнимая тоже. Пустая колода событий не даёт — возвращается `null`, и
 * взятие остаётся просто взятием.
 */
export function drawBinge(
  decks: BingeDecks,
  rank: BingeRank,
  position: Position,
  side: Side,
  roll: () => number,
  table: BingeTable = BARE_TABLE,
): BingeDeal | null {
  const deck = decks[rank];
  const id = pick(deck, roll);
  if (id === undefined) return null;

  deck.splice(deck.indexOf(id), 1);
  const card = BY_ID.get(id);
  if (!card) return null;

  return {
    event: { id: card.id, rank: card.rank, title: card.title, text: card.text },
    position: playBinge(position, card, side, roll, table),
  };
}

/**
 * Что событие сделало с позицией; `null` — «мимо».
 *
 * Мимо — это три случая: играть нечем (менять местами нечего), играть некуда
 * (доска полна) и «событие подставило бы своего короля». Последнее важно:
 * карту тянет тот, кто уже сходил, и оставить его короля под боем значило бы
 * отдать партию броском костей, а не игрой.
 *
 * «Ничего не изменилось» мимом не считается: две твои пешки, поменявшиеся
 * местами, неразличимы — в этом и шутка «Обознался».
 */
function playBinge(
  position: Position,
  card: Card,
  side: Side,
  roll: () => number,
  table: BingeTable,
): Position | null {
  const after = card.play(position, side, roll, table);
  if (!after) return null;
  if (inCheck(after, side)) return null;
  return after;
}

export function bingePosition(): Position {
  // Банк лишних ходов: им живут «Второе дыхание» и «Разгуляй».
  return { ...classicPosition(), extra: [0, 0] };
}

/** Как действующий эффект зовётся в полосе над доской. */
export const EFFECT_LABEL: Record<EffectKind, string> = {
  rush: "Разгон",
  hangover: "Похмелье",
  tremor: "Тремор",
  blind: "Слепота",
  stagger: "Заплетается",
  skid: "Занос",
  swagger: "Кураж",
  closed: "Кабак закрыт",
  thirst: "Сушняк",
};

/** И что он делает — одной короткой строкой, рядом с названием. */
export const EFFECT_HINT: Record<EffectKind, string> = {
  rush: "пешки ходят на три клетки",
  hangover: "ходить той же фигурой",
  tremor: "доска вверх ногами",
  blind: "ходы не подсвечиваются",
  stagger: "пешки ходят вбок",
  skid: "кони слонами, слоны конями",
  swagger: "взятие даст лишний ход",
  closed: "без рокировки и взятия на проходе",
  thirst: "меньше времени на ход",
};

/** Сколько эффекту осталось — человеческим текстом для полосы. */
export function effectLeft(effect: Effect): string {
  if (effect.kind === "swagger") return "до взятия";
  if (effect.left === 1) return "ещё ход";

  return `ещё ${effect.left} хода`;
}

/** Кого эффект касается: полоса общая, а эффекты у сторон разные. */
export function effectWhom(effect: Effect, mySide: Side | null): string {
  if (effect.side === null) return "у обоих";
  if (mySide === null) return effect.side === 0 ? "у белых" : "у чёрных";

  return effect.side === mySide ? "у тебя" : "у соперника";
}

/** «Слепота»: этой стороне ходы не подсвечиваются. */
export function blinded(position: Position, side: Side | null): boolean {
  return side !== null && bent(position, "blind", side) !== null;
}

/** «Тремор»: доска показана вверх ногами — обоим сразу. */
export function shaking(position: Position): boolean {
  return bent(position, "tremor") !== null;
}

/**
 * «Сушняк»: минус тридцать секунд с ближайшего хода — но не больше половины
 * лимита, иначе на десятисекундном контроле карта была бы не сушняком, а
 * упавшим флагом. В безлимитной комнате резать нечего.
 */
export const THIRST_MS = 30_000;

export function thirstCut(
  position: Position,
  side: Side,
  limitMs: number | null,
): number {
  if (limitMs === null || !bent(position, "thirst", side)) return 0;

  return Math.min(THIRST_MS, Math.floor(limitMs / 2));
}

/** Правила для игрока — на карточке перед стартом и по кнопке у доски. */
export function bingeRules(): string[] {
  return [
    "Шахматы обычные, но каждое взятие тянет случайное событие из колоды того ранга, чью фигуру срубили: пешка, конь со слоном, ладья, ферзь.",
    "Карту тянет срубивший — но бьёт она не всегда по сопернику. В этом и рулетка.",
    "Сыгравшая карта выбывает до конца партии, и колоды общие на двоих: что выпало одному, второму уже не выпадет. Кончилась колода — взятия этого ранга событий больше не дают.",
    "Событие, которому в этой позиции нечего делать, сгорает впустую: карточка покажет «мимо».",
    "Сколько карт осталось в каждой колоде — видно обоим.",
    ...(BINGE_EVENTS.length < BINGE_TOTAL
      ? [
          `Событий пока ${BINGE_EVENTS.length} из ${BINGE_TOTAL}: остальные доезжают на этом же этапе.`,
        ]
      : []),
  ];
}

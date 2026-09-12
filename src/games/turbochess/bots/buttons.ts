import type { PieceKind, Side } from "../engine/pieces";
import type { Position } from "../engine/position";
import { homeSquare, legalMoves } from "../engine/moves";
import { squareName } from "../engine/geometry";
import type { MarketItem, MarketOrder } from "../engine/game";
import { marketPrice, pointsLeft, revivable } from "../modes/market";
import { PIECE_VALUE } from "../modes/points";
import type { Character, CharacterTraits } from "./characters";
import type { Level } from "./levels";

/**
 * Кнопки режимов: то, чего нет в списке ходов.
 *
 * Перебор сюда не помогает ничем — он умеет сравнивать ходы, а сбросить бомбу,
 * сказать «НЕТ», прыгнуть последним шансом, подтвердить чужую стопку или
 * купить щит ходом не является. Это вкусовые решения, и приняты они хозяином
 * ([BOTS.md](../docs/BOTS.md), раздел «Решено по режимам»); здесь они записаны
 * числами.
 *
 * Все функции чистые и получают бросок снаружи: случайность в игре только от
 * зерна партии, иначе её не перемотать.
 */

/** Сколько сотых пешки стоит фигура. Оценка считает в той же шкале. */
const PAWN = 100;

/**
 * Готовность характера жать кнопки, приведённая к множителю.
 *
 * Кальянный мастер (нерв 0.25) жмёт вдвое реже спокойного, кровожадный (0.95)
 * — в полтора раза чаще. Само решение от этого не переворачивается: множитель
 * двигает вероятность, а не заменяет её.
 */
function eagerness(traits: CharacterTraits): number {
  return 0.6 + traits.nerve * 0.8;
}

function chance(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Ядерные: жать ли бомбу.
 *
 * Решено хозяином: порог нажатия зависит от того, насколько бот выигрывает или
 * проигрывает, и в решении есть случайность — чтобы за десяток партий игрок не
 * выучил момент. Проигрывает — жмёт почти сразу, бомба для него единственный
 * выход; равная позиция — жмёт с заметной вероятностью каждый ход; выигрывает —
 * тянет, но чем дольше тянет, тем вероятнее.
 */
export function bombCall(input: {
  /** Оценка позиции глазами бота, в сотых долях пешки. */
  edge: number;
  /** Сколько своих ходов прошло с тех пор, как заряд добрал до порога. */
  since: number;
  traits: CharacterTraits;
  roll: () => number;
}): boolean {
  const { edge, since, traits } = input;

  let base: number;
  if (edge < -2 * PAWN) base = 0.8;
  else if (edge <= 2 * PAWN) base = 0.3;
  else base = 0.08 + 0.05 * Math.max(0, since);

  return input.roll() < chance(base * eagerness(traits));
}

/**
 * Анархия: отменять ли чужой ход.
 *
 * Решено хозяином: вероятность считается выгодностью чужого хода — чем он хуже
 * для бота, тем вероятнее «НЕТ». Мат отменяется всегда, пока «НЕТ» есть: иначе
 * кнопка не работает в единственный момент, когда она по-настоящему нужна.
 */
export function vetoCall(input: {
  /** Насколько чужой ход испортил позицию, в сотых долях пешки. */
  loss: number;
  /** Бот заматован, и «НЕТ» — единственный выход. */
  mate: boolean;
  /** Сколько «НЕТ» осталось. */
  left: number;
  traits: CharacterTraits;
  roll: () => number;
}): boolean {
  if (input.left <= 0) return false;
  if (input.mate) return true;

  // Ниже пешки отменять нечего: четыре «НЕТ» сгорели бы за десяток ходов.
  const worth = (input.loss - PAWN) / (6 * PAWN);
  // Последнее «НЕТ» приберегается под мат: там оно стоит целой партии.
  const saving = input.left === 1 ? 0.4 : 1;

  return input.roll() < chance(worth * eagerness(input.traits) * saving);
}

/**
 * Последний шанс: прыгать ли королём.
 *
 * Шанс один на партию, поэтому берётся он до мата. Сильные уровни жмут раньше
 * — под шахом, из которого нет выхода без большой потери: они это видят.
 */
export function chanceCall(input: {
  /** Бота заматовали: кнопка — или сдача. */
  mate: boolean;
  /** Боту объявлен шах. */
  check: boolean;
  /** Во сколько обходится лучший выход из шаха, в сотых долях пешки. */
  cost: number;
  level: Level;
  traits: CharacterTraits;
}): boolean {
  if (input.mate) return true;
  if (!input.check) return false;
  // Слабые уровни берегут шанс до мата: считать «безвыходность» им нечем.
  if (input.level.sloppiness > 0.05) return false;

  return input.cost >= 3 * PAWN * (2 - eagerness(input.traits));
}

/** Кто из характеров может промолчать на чужой стопке. */
const LIARS: readonly Character[] = ["drunk", "butcher"];

/**
 * Алко: подтверждать ли, что соперник выпил.
 *
 * По характеру, по умолчанию честно: штраф за молчание бьёт по обоим, так что
 * честность здесь не доброта, а счёт. Пауза — чтобы мгновенный ответ не выдавал
 * программу; изредка бот тянет до последнего, «задумавшись над стопкой».
 */
export function toastCall(input: {
  traits: CharacterTraits;
  /** Сколько всего даётся на окно. */
  windowMs: number;
  roll: () => number;
}): { confirm: boolean; waitMs: number } {
  const { traits, windowMs } = input;
  const lies = LIARS.includes(traits.id) && input.roll() < 0.25;
  const slow = input.roll() < 0.15;
  const waitMs = slow
    ? windowMs * (0.7 + input.roll() * 0.25)
    : 3_000 + input.roll() * 5_000;

  return {
    // Соврать здесь — это промолчать: подтверждения не будет, штраф придёт обоим.
    confirm: !lies,
    waitMs: Math.min(windowMs - 500, Math.round(waitMs)),
  };
}

/** Сколько своих ходов бот не подходит к прилавку: иначе магазин как кран. */
export const MARKET_COOLDOWN = 3;

/**
 * Чёрный рынок: что покупать.
 *
 * Порядок предпочтений решён хозяином: сначала дополнительный ход — самое
 * сильное за свои деньги, — потом воскрешение ферзя, потом щит. Перестановку и
 * обмен бот не берёт: их выгоду видит перебор, а перебор про магазин не знает.
 */
export function marketCall(input: {
  position: Position;
  seat: Side;
  /** Сколько своих ходов прошло с прошлой покупки. */
  since: number;
  traits: CharacterTraits;
  roll: () => number;
}): MarketOrder | null {
  const { position, seat, traits } = input;
  if (input.since < MARKET_COOLDOWN) return null;

  const points = pointsLeft(position, seat);
  const afford = (item: MarketItem, kind?: PieceKind) =>
    points >= marketPrice(item, kind);

  // Терпение характера: стратег копит, вайбкодер тратит при первой возможности.
  if (input.roll() > traits.nerve) return null;

  // Дополнительный ход — только когда есть что им забрать: иначе это подарок
  // сопернику в виде потраченных очков.
  if (afford("extra") && legalMoves(position).some((move) => move.captured)) {
    return { item: "extra" };
  }

  const dead = revivable(position, seat).sort(
    (left, right) => PIECE_VALUE[right] - PIECE_VALUE[left],
  );
  const best = dead[0];
  if (best && afford("revive", best)) {
    const free = freeHome(position, seat, best);
    if (free)
      return { item: "revive", kind: best as MarketOrder["kind"], to: free };
  }

  return null;
}

/**
 * Свободная клетка своих двух горизонталей, куда встанет воскрешённая фигура.
 *
 * Свои горизонтали спрашиваются у движка: он же решает это и для подкрепления,
 * и для зомби, и повторять его арифметику здесь незачем.
 */
function freeHome(
  position: Position,
  seat: Side,
  kind: PieceKind,
): string | null {
  const { geometry, board } = position;

  for (let square = 0; square < board.length; square++) {
    if (board[square]) continue;
    if (!homeSquare(position, seat, square)) continue;
    // Пешку на свою первую горизонталь не выставляют — как в крейзихаусе.
    if (kind === "p" && firstRank(position, seat, square)) continue;

    return squareName(geometry, square);
  }

  return null;
}

/** Своя первая горизонталь: та, на которой стоит король в начале партии. */
function firstRank(position: Position, seat: Side, square: number): boolean {
  const rules = position.sides[seat];
  if (!rules) return false;

  const [, dy] = rules.forward;
  const line = Math.floor(square / position.geometry.width);
  return dy > 0 ? line === 0 : line === position.geometry.height - 1;
}

/**
 * Вскрываемся: как бот расставляется.
 *
 * Решено хозяином: по заготовкам, своим на каждый характер — расстановка это
 * лицо характера, в ней он виден лучше, чем в ходах. Заготовка — это список
 * обменов от стандартной расстановки: так её не собрать неполной, а время может
 * кончиться в любой момент.
 *
 * Клетки зоны нумеруются подряд: 0–7 — первая горизонталь (ладья, конь, слон,
 * ферзь, король, слон, конь, ладья), 8–15 — вторая, пешки.
 */
const SETUPS: Record<Character, readonly (readonly [number, number])[]> = {
  /** Король в угол, ладьи к нему: прятаться так прятаться. */
  strategist: [
    [4, 0],
    [3, 1],
  ],
  /** Слоны вперёд, пешки по бокам: резать сразу. */
  butcher: [
    [2, 10],
    [5, 13],
  ],
  /** Конями в центр: с них и начнём. */
  pilot: [
    [1, 11],
    [6, 12],
  ],
  /** Ферзь на вторую линию, за пешку: пусть поищут. */
  genius: [
    [3, 12],
    [0, 4],
  ],
  /** Пешка перед королём уходит вбок: «мне не мешать». */
  granddad: [[12, 15]],
  /** Всё как в книжке — и пусть соперник гадает, что тут не так. */
  physicist: [],
  /** Ладьи вперёд: ломать так ломать. */
  dwarf: [
    [0, 8],
    [7, 15],
  ],
  /** Ферзь и король меняются флангами: «ой, а так можно было?» */
  sweetie: [[3, 4]],
  /** Слоны назад, пешки вперёд — «работает, не трогай». */
  coder: [
    [2, 3],
    [5, 6],
  ],
  /** Ничего не трогает: не спеши, брат. */
  hookah: [],
  /** Что-то тронул и забыл что: одна случайная перестановка. */
  drunk: [[1, 9]],
};

/** Обмены, которыми бот собирает свою расстановку. */
export function setupCall(
  character: Character,
): readonly (readonly [number, number])[] {
  return SETUPS[character];
}

/**
 * Сколько бот «думает» над расстановкой: десять-тридцать секунд.
 *
 * Мгновенная готовность выдаёт программу, а ожидание до конца окна бесит
 * человека — он смотрит в закрытую доску и ждёт непонятно чего.
 */
export function setupWait(roll: () => number): number {
  return Math.round(10_000 + roll() * 20_000);
}

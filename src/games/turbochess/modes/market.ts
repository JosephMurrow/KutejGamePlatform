import type { MarketItem } from "../engine/game";
import type { PieceKind, Side } from "../engine/pieces";
import { classicPosition, type Position } from "../engine/position";
import { PIECE_VALUE, pointsOf } from "./points";

/**
 * Режим 13, «Чёрный рынок» (docs/MODES.md): очки за взятые фигуры тратятся в
 * магазине.
 *
 * Своего у режима — прайс и то, что считается очками; сами эффекты умеет
 * фасад, а щит едет меткой на фигуре. Покупка ходом не считается — кроме
 * дополнительного хода, который ход и есть.
 */

/** Прайс как в постановке. У воскрешения к этому прибавляется номинал. */
export const MARKET_PRICE: Record<MarketItem, number> = {
  extra: 4,
  shield: 5,
  relocate: 6,
  swap: 7,
  revive: 3,
};

export const MARKET_LABEL: Record<MarketItem, string> = {
  extra: "Дополнительный ход",
  shield: "Щит",
  relocate: "Переставить",
  swap: "Обмен",
  revive: "Воскрешение",
};

export const MARKET_HINT: Record<MarketItem, string> = {
  extra: "ходишь дважды подряд",
  shield: "фигура переживает одно взятие: рубящий вернётся назад",
  relocate: "своя фигура — на любую свободную клетку",
  swap: "две свои фигуры меняются местами",
  revive: "взятая у тебя фигура встаёт на свои две горизонтали",
};

/** Порядок карточек в магазине — от дешёвого к дорогому. */
export const MARKET_ITEMS: readonly MarketItem[] = [
  "extra",
  "shield",
  "relocate",
  "swap",
  "revive",
];

/** Сколько стоит покупка. У воскрешения цена зависит от того, кого поднимают. */
export function marketPrice(item: MarketItem, kind?: PieceKind): number {
  if (item !== "revive") return MARKET_PRICE[item];

  return MARKET_PRICE.revive + (PIECE_VALUE[kind ?? "p"] ?? 0);
}

export function marketPosition(): Position {
  return { ...classicPosition(), spent: [0, 0], extra: [0, 0] };
}

/** Сколько очков осталось: набранное взятиями минус потраченное. */
export function pointsLeft(position: Position, side: Side): number {
  return pointsOf(position, side) - (position.spent[side] ?? 0);
}

/** Кого можно воскресить: то, что забрал у тебя соперник, без повторов. */
export function revivable(position: Position, side: Side): PieceKind[] {
  const enemy = position.sides.findIndex((_, seat) => seat !== side);
  const grave = enemy < 0 ? [] : (position.taken[enemy] ?? []);

  return [...new Set(grave.map((cell) => cell.kind))];
}

/** Правила для игрока — на карточке перед стартом и по кнопке у доски. */
export function marketRules(): string[] {
  return [
    "Шахматы обычные, но за взятые фигуры идут очки: пешка — 1, конь и слон — 3, ладья — 5, ферзь — 9.",
    `В любой момент своего хода открывается магазин: дополнительный ход — ${MARKET_PRICE.extra}, щит — ${MARKET_PRICE.shield}, переставить свою фигуру — ${MARKET_PRICE.relocate}, обменять две свои местами — ${MARKET_PRICE.swap}, воскресить взятую — её номинал плюс ${MARKET_PRICE.revive}.`,
    "Покупка не тратит ход — кроме дополнительного хода, который ход и есть: после него очередь остаётся у вас ещё на один.",
    "Щит держится до первого взятия: рубящий возвращается назад, а щит сгорает. В записи такой ход помечен крышкой.",
    "Воскрешённая встаёт на свободную клетку ваших двух горизонталей; пешку на первую не ставят. Очки живут одну партию и сгорают.",
  ];
}

import type { Side } from "../engine/pieces";
import {
  CLASSIC_RULES,
  ZOMBIE_DELAY,
  classicPosition,
  type Position,
  type Zombie,
} from "../engine/position";

/**
 * Режим 14, «Зомби-шахматы» (docs/MODES.md): срубленная фигура через три хода
 * встаёт за того, кто её срубил, и его цветом.
 *
 * Своего в режиме только одно правило — оно лежит в позиции, и по нему движок
 * ставит взятую фигуру в очередь. Выставление на доску — общая механика
 * резерва, та же, что у подкрепления.
 */

export function zombiePosition(): Position {
  return {
    ...classicPosition(),
    rules: { ...CLASSIC_RULES, zombies: true },
  };
}

/** Очередь этой стороны, от самой близкой к резерву. */
export function zombieQueue(position: Position, side: Side): Zombie[] {
  return position.pending
    .filter((zombie) => zombie.side === side)
    .sort((one, other) => one.left - other.left);
}

/** Сколько ждать зомби — человеческим текстом для полки. */
export function zombieWait(left: number): string {
  if (left <= 0) return "готова";
  if (left === 1) return "через ход";
  return `через ${left} хода`;
}

/** Правила для игрока — на карточке перед стартом и по кнопке у доски. */
export function zombieRules(): string[] {
  return [
    `Шахматы обычные, но мёртвые встают. Взятая фигура через ${ZOMBIE_DELAY} ваших хода переходит тому, кто её срубил, и меняет цвет на его.`,
    "Поставить зомби на свободную клетку своих двух первых горизонталей — это ход, как и вызов подкрепления.",
    "Полка у доски показывает обратный отсчёт: «через 3 хода», «через ход», «готова».",
    "Король не зомбируется никогда. Пешку на первую горизонталь не ставят.",
  ];
}

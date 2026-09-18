import type { Side } from "../engine/pieces";
import {
  CLASSIC_RULES,
  STALL_PLIES,
  classicPosition,
  type Position,
} from "../engine/position";

/**
 * Режим 3, «На уничтожение» (docs/MODES.md): мата нет вовсе, цель — снять с
 * доски все фигуры соперника.
 *
 * Расстановка обычная — режим меняет не её, а цель партии. Цель лежит в самой
 * позиции, поэтому её одинаково видят и сервер, и доска в браузере
 * (engine/position.ts, `PositionRules`).
 */

/** С какого остатка показывать счётчик до остановки. */
export const STALL_WARN = 15;

export function annihilationPosition(): Position {
  return {
    ...classicPosition(),
    rules: { ...CLASSIC_RULES, goal: "wipe" },
  };
}

/** Сколько фигур сняла сторона. Считаем штуки, а не номиналы: так решено. */
export function takenCount(position: Position, side: Side): number {
  return position.taken[side]?.length ?? 0;
}

/** Сколько полуходов осталось до остановки. Любое взятие возвращает счётчик. */
export function stallLeft(position: Position): number {
  return Math.max(0, STALL_PLIES - position.sinceCapture);
}

/** Правила для игрока — на карточке перед стартом и по кнопке у доски. */
export function annihilationRules(): string[] {
  return [
    "Мат не кончает партию, и шаха нет вовсе: король ходит и рубится как обычная фигура. Побеждает тот, кто снимет с доски всё.",
    "Рокировка есть, и она свободнее обычной: раз шаха нет, рокироваться можно и под боем, и через битое поле — лишь бы дорога была свободна.",
    `Если за ${STALL_PLIES} полуходов никто никого не съел, партия останавливается и считается по взятым фигурам: у кого больше, тот и выиграл, поровну — ничья.`,
    "Ходить нечем, а фигуры есть — партию так же останавливаем и считаем по взятым. Пата здесь нет.",
    "Пешка превращается как обычно: ферзь, ладья, слон или конь. Королём стать нельзя.",
  ];
}

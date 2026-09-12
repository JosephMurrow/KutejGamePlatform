import type { Position } from "../engine/position";
import type { Side } from "../engine/pieces";
import { hideAgents } from "../modes/agents";
import type { Level } from "./levels";

/**
 * Что видит бот.
 *
 * Решено хозяином: честность зависит от уровня — секреты видит только
 * максимальный ([BOTS.md](../docs/BOTS.md), А11). Бот живёт на сервере, рядом с
 * полной позицией, и подсмотреть ему ничего не мешает: именно поэтому это
 * решено словами, а не оставлено как выйдет.
 *
 * Секретов в игре три, и прячется здесь один — двойной агент. Чужой заряд бомбы
 * и чужая расстановка до вскрытия в позиции не лежат вовсе: заряд считается по
 * взятому, а расстановка до вскрытия живёт в комнате. Значит спрятать их от
 * бота нечего, а вот не дать ему их **спросить** — забота тех мест, где он их
 * спрашивает (подэтапы 13в и 13б).
 */
export function viewFor(
  position: Position,
  seat: Side,
  level: Level,
): Position {
  return level.sees ? position : hideAgents(position, seat);
}

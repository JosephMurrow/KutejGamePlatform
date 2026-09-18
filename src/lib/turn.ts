/**
 * Когда звать игрока к ходу — чистая логика без браузера, чтобы её можно было
 * проверить тестом. Сам зов (попап, звук, мигание вкладки) — в
 * `src/components/room/TurnAlert.tsx`.
 */

/**
 * Что делать, когда очередь поменялась.
 *
 * `turn` — метка текущей очереди: меняется, когда ход переходит, и `null`,
 * когда ходить сейчас некому (партия не идёт, раунд вскрывается). Игра сама
 * решает, что считать переходом: в турбо-шахматах купленный лишний ход
 * оставляет метку прежней, и повторно никого не зовут.
 *
 * - `"mine"` — ход перешёл ко мне;
 * - `"watch"` — ход перешёл к кому-то, а я зритель;
 * - `null` — звать некого: метка не поменялась, ходить некому, это первый
 *   снимок после входа (человек и так смотрит на доску) или ход перешёл к
 *   сопернику игрока.
 */
export type TurnEvent = "mine" | "watch" | null;

export function turnEvent(
  was: string | null | undefined,
  now: string | null,
  mine: boolean,
  watching: boolean,
): TurnEvent {
  if (was === undefined || now === null || now === was) return null;
  if (mine) return "mine";
  return watching ? "watch" : null;
}

/** Что пишется во вкладке, пока она мигает: зов и прежний заголовок по очереди. */
export function blinkTitle(tick: number, call: string, title: string): string {
  return tick % 2 === 0 ? call : title;
}

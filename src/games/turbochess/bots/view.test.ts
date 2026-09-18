import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agentPosition } from "../modes/agents";
import { LEVELS } from "./levels";
import { viewFor } from "./view";

/**
 * Что видит бот. Решение хозяина: секреты — только максимальному уровню.
 */

/** Сколько своих агентов сторона различает на доске. */
function known(position: ReturnType<typeof agentPosition>, side: number) {
  return position.board.filter((cell) => cell?.agent && cell.side === side)
    .length;
}

describe("честность бота", () => {
  it("обычный уровень своего агента не знает", () => {
    const full = agentPosition(11);
    const seen = viewFor(full, 0, LEVELS.hard);

    assert.equal(known(full, 0), 1, "в партии агент есть");
    assert.equal(known(seen, 0), 0, "а бот его не видит");
    // Чужого агента видно — это правило режима, а не поблажка.
    assert.equal(known(seen, 1), 1);
  });

  it("эксперт видит всё: это его преимущество вместо пятого уровня", () => {
    const full = agentPosition(11);
    const seen = viewFor(full, 0, LEVELS.expert);

    assert.equal(seen, full);
    assert.equal(known(seen, 0), 1);
  });

  it("в режимах без секретов прятать нечего", () => {
    const full = agentPosition(11);
    const easy = viewFor(full, 1, LEVELS.easy);

    assert.equal(known(easy, 1), 0);
    assert.equal(known(easy, 0), 1);
  });
});

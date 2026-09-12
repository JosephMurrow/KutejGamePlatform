import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LEVEL_IDS, LEVELS, levelOf } from "./levels";

/**
 * Уровни: сила режется глубиной и зевком, а поблажки — только максимальному.
 */

describe("уровни бота", () => {
  it("их четыре, и они идут от слабого к сильному", () => {
    assert.deepEqual(LEVEL_IDS, ["easy", "normal", "hard", "expert"]);

    const depths = LEVEL_IDS.map((id) => LEVELS[id].depth);
    const slops = LEVEL_IDS.map((id) => LEVELS[id].sloppiness);

    assert.deepEqual(depths, [1, 2, 2, 3]);
    // Зевок падает с ростом уровня и на эксперте кончается.
    assert.deepEqual(
      [...slops].sort((a, b) => b - a),
      slops,
    );
    assert.equal(LEVELS.expert.sloppiness, 0);
  });

  it("секреты и альянсы — только у максимального", () => {
    const cheats = LEVEL_IDS.filter((id) => LEVELS[id].sees);
    const allies = LEVEL_IDS.filter((id) => LEVELS[id].allies);

    assert.deepEqual(cheats, ["expert"]);
    assert.deepEqual(allies, ["expert"]);
  });

  it("незнакомое имя уровня — это «Нормальный», а не падение", () => {
    assert.equal(levelOf("hard").id, "hard");
    assert.equal(levelOf("магнус").id, "normal");
    assert.equal(levelOf(undefined).id, "normal");
  });
});

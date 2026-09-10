import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bonusFor,
  counts,
  MAX_BONUS,
  MIN_BONUS,
  REAL_GAME_PLIES,
} from "./bonus";

describe("надбавка за победу", () => {
  it("тает на каждом десятке партий с тем же соперником", () => {
    assert.equal(bonusFor(0), 1);
    assert.equal(bonusFor(9), 1);
    assert.equal(bonusFor(10), 0.9);
    assert.equal(bonusFor(19), 0.9);
    // Условие из плана: за сороковую партию с одним соперником — шесть десятых.
    assert.equal(bonusFor(40), 0.6);
    assert.equal(bonusFor(49), 0.6);
  });

  it("ниже одной десятой не падает", () => {
    assert.equal(bonusFor(90), MIN_BONUS);
    assert.equal(bonusFor(1000), MIN_BONUS);
  });

  it("за одну победу больше единицы не дают", () => {
    for (const played of [0, 1, 5, 12, 300]) {
      assert.ok(bonusFor(played) <= MAX_BONUS);
    }
  });

  it("в зачёт идёт только мат или сдача в состоявшейся партии", () => {
    const real = { plies: REAL_GAME_PLIES, human: true };

    assert.equal(counts({ ...real, reason: "checkmate" }), true);
    assert.equal(counts({ ...real, reason: "resign" }), true);
    assert.equal(
      counts({ ...real, reason: "flag" }),
      false,
      "победа по времени",
    );
    assert.equal(counts({ ...real, reason: "abandoned" }), false, "брошенная");
    assert.equal(counts({ ...real, reason: "agreement" }), false, "ничья");
  });

  it("победа над ботом не считается вовсе", () => {
    assert.equal(
      counts({ reason: "checkmate", plies: 80, human: false }),
      false,
    );
  });

  it("короткая партия не считается", () => {
    assert.equal(
      counts({ reason: "resign", plies: REAL_GAME_PLIES - 1, human: true }),
      false,
      "сдался на втором ходу — не способ переливать очки",
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromFen } from "../engine/fen";
import { TurboGame } from "../engine/game";
import { insufficientMaterial } from "../engine/moves";
import { CLASSIC_RULES, ZOMBIE_DELAY, type Position } from "../engine/position";
import {
  zombiePosition,
  zombieQueue,
  zombieRules,
  zombieWait,
} from "./zombies";

/**
 * «Зомби-шахматы»: срубленная фигура через три хода встаёт за того, кто её
 * срубил. Само выставление проверено у подкрепления — здесь очередь: кто в
 * неё попадает, чьи ходы её двигают и чьим цветом фигура возвращается.
 */

const ZOMBIE = zombiePosition().rules;

/** Сыграть ходы подряд, проверяя, что каждый принят. */
function play(game: TurboGame, line: readonly (readonly [string, string])[]) {
  for (const [from, to] of line) {
    assert.equal(game.move({ from, to }, game.ply()).ok, true, `${from}${to}`);
  }
}

describe("зомби: очередь", () => {
  it("взятая встаёт в очередь на три хода хозяина", () => {
    const game = new TurboGame(zombiePosition());
    play(game, [
      ["e2", "e4"],
      ["d7", "d5"],
      ["e4", "d5"],
    ]);

    assert.deepEqual(zombieQueue(game.position(), 0), [
      { kind: "p", side: 0, left: ZOMBIE_DELAY },
    ]);
    assert.deepEqual(game.position().reserve[0], [], "сразу в резерв не идёт");
  });

  it("счётчик двигают только ходы нового хозяина", () => {
    const game = new TurboGame(zombiePosition());
    play(game, [
      ["e2", "e4"],
      ["d7", "d5"],
      ["e4", "d5"],
      ["g8", "f6"],
    ]);
    assert.equal(
      zombieQueue(game.position(), 0)[0]?.left,
      ZOMBIE_DELAY,
      "чужой ход счётчик не трогает",
    );

    play(game, [["b1", "c3"]]);
    assert.equal(zombieQueue(game.position(), 0)[0]?.left, ZOMBIE_DELAY - 1);
  });

  it("через три своих хода фигура в резерве и своего цвета", () => {
    const game = new TurboGame(zombiePosition());
    play(game, [
      ["e2", "e4"],
      ["d7", "d5"],
      ["e4", "d5"],
      ["g8", "f6"],
      ["b1", "c3"],
      ["b8", "c6"],
      ["g1", "f3"],
      ["c8", "f5"],
      ["a2", "a4"],
      ["e7", "e6"],
    ]);

    assert.deepEqual(zombieQueue(game.position(), 0), []);
    assert.deepEqual(game.position().reserve[0], ["p"]);

    assert.equal(game.move({ drop: "p", to: "a2" }, game.ply()).ok, true);
    assert.equal(game.pieceAt("a2")?.side, 0, "пешка сменила хозяина");
  });

  it("король не зомбируется никогда", () => {
    // Короля берут только там, где мата нет, — правила для проверки сложены
    // из двух: цель «снять всё» и зомби.
    const game = new TurboGame({
      ...fromFen("6Rk/8/8/8/8/8/8/4K3 w - - 0 1"),
      rules: { ...CLASSIC_RULES, goal: "wipe", zombies: true },
    });

    assert.equal(game.move({ from: "g8", to: "h8" }, 0).ok, true);
    assert.deepEqual(game.position().pending, []);
  });
});

describe("зомби: показ и материал", () => {
  it("отсчёт называется по-человечески", () => {
    assert.equal(zombieWait(3), "через 3 хода");
    assert.equal(zombieWait(1), "через ход");
    assert.equal(zombieWait(0), "готова");
  });

  it("правила игроку называют срок и цвет", () => {
    const lines = zombieRules().join(" ");
    assert.match(lines, /3 ваших хода/);
    assert.match(lines, /цвет/);
  });

  it("с зомби в кармане голые короли ничьей не дают", () => {
    const bare = fromFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    assert.equal(insufficientMaterial(bare), true);

    const waiting: Position = {
      ...bare,
      rules: ZOMBIE,
      pending: [{ kind: "q", side: 0, left: 1 }],
    };
    assert.equal(insufficientMaterial(waiting), false);

    const stocked: Position = { ...bare, rules: ZOMBIE, reserve: [["q"], []] };
    assert.equal(insufficientMaterial(stocked), false);
  });
});

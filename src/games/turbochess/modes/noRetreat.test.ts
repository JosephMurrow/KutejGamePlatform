import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromFen } from "../engine/fen";
import { TurboGame } from "../engine/game";
import type { Position } from "../engine/position";
import { noRetreatPosition, noRetreatRules } from "./noRetreat";

/**
 * «Пацанские шахматы»: назад не ходят. Проверяем сам запрет — по фигурам и
 * рядом с обычными правилами, — и то, что «ходить нечем» стало поражением.
 */

const BOYISH = noRetreatPosition().rules;

function fen(text: string): Position {
  return fromFen(text, BOYISH);
}

/** Куда может пойти фигура с этой клетки. */
function from(position: Position, square: string): string[] {
  return new TurboGame(position)
    .legal()
    .filter((move) => move.from === square)
    .map((move) => move.to)
    .sort();
}

describe("пацанские: запрет назад", () => {
  it("расстановка обычная, но рокировки нет", () => {
    assert.deepEqual(noRetreatPosition().castling, []);
    assert.equal(BOYISH.forwardOnly, true);
    assert.equal(BOYISH.stalemate, "loss");
  });

  it("ладья ходит вперёд и вбок, назад — никогда", () => {
    const board = "4k3/8/8/8/3R4/8/8/4K3 w - - 0 1";
    const boyish = from(fen(board), "d4");

    assert.ok(boyish.includes("d8"), "вперёд можно");
    assert.ok(boyish.includes("a4") && boyish.includes("h4"), "вбок можно");
    assert.ok(!boyish.includes("d3"), "назад нельзя");
    assert.ok(
      from(fromFen(board), "d4").includes("d3"),
      "по обычным правилам назад можно",
    );
  });

  it("конь ходит четырьмя прыжками из восьми", () => {
    const knight = from(fen("4k3/8/8/8/3N4/8/8/4K3 w - - 0 1"), "d4");

    assert.deepEqual(knight, ["b5", "c6", "e6", "f5"]);
  });

  it("слон ходит по двум передним диагоналям, король — на пять клеток", () => {
    const bishop = from(fen("4k3/8/8/8/3B4/8/8/4K3 w - - 0 1"), "d4");
    assert.ok(bishop.every((square) => Number(square[1]) > 4));

    const king = from(fen("4k3/8/8/8/3K4/8/8/8 w - - 0 1"), "d4");
    assert.deepEqual(king, ["c4", "c5", "d5", "e4", "e5"]);
  });

  it("у чёрных «вперёд» — вниз", () => {
    const rook = from(fen("4k3/8/8/3r4/8/8/8/4K3 b - - 0 1"), "d5");

    assert.ok(rook.includes("d1"), "чёрным вперёд — вниз");
    assert.ok(!rook.includes("d6"), "назад нельзя и им");
  });
});

describe("пацанские: чем кончается", () => {
  it("ходить нечем — поражение, а не пат", () => {
    // Белые заперты в углу своими же; чёрный король ходит только вбок.
    const game = new TurboGame(fen("6PK/6PP/8/8/8/8/8/k7 b - - 0 1"));

    assert.equal(game.move({ from: "a1", to: "b1" }, 0).ok, true);
    assert.deepEqual(game.outcome(), { result: 1, reason: "noMoves" });
  });

  it("правила игроку объясняют запрет и затемнение", () => {
    const lines = noRetreatRules().join(" ");

    assert.match(lines, /только вперёд и вбок/i);
    assert.match(lines, /затемняется/);
    assert.match(lines, /Рокировки нет/);
  });
});

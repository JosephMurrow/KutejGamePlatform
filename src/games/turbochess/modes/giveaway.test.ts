import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromFen } from "../engine/fen";
import { TurboGame } from "../engine/game";
import { classicPosition, type Position } from "../engine/position";
import { giveawayPosition, giveawayRules } from "./giveaway";

/**
 * «Поддавки»: цель обратная — скормить сопернику своего короля. Держится всё
 * на обязательном взятии, с него и начинаем.
 */

/** Правила режима берём из его же расстановки, а не переписываем в тесте. */
const FEED = giveawayPosition().rules;

function fen(text: string): Position {
  return fromFen(text, FEED);
}

function moves(position: Position): string[] {
  return new TurboGame(position)
    .legal()
    .map((move) => `${move.from}${move.to}`);
}

describe("поддавки: правила", () => {
  it("расстановка обычная, но рокировки нет вовсе", () => {
    assert.deepEqual(giveawayPosition().board, classicPosition().board);
    assert.deepEqual(giveawayPosition().castling, []);
    assert.equal(giveawayPosition().rules.goal, "feed");
    assert.equal(giveawayPosition().rules.mustCapture, true);
  });

  it("есть чем взять — только взятия и остаются", () => {
    const game = new TurboGame(giveawayPosition());
    assert.equal(game.move({ from: "e2", to: "e4" }, 0).ok, true);
    assert.equal(game.move({ from: "d7", to: "d5" }, 1).ok, true);

    assert.deepEqual(game.legal(), [{ from: "e4", to: "d5" }]);
  });

  it("взять можно по-разному — выбирает игрок", () => {
    assert.deepEqual(moves(fen("4k3/8/8/8/8/2n5/1P1P4/4K3 w - - 0 1")).sort(), [
      "b2c3",
      "d2c3",
    ]);
  });

  it("шаха нет: под бой ходить можно", () => {
    const board = "k7/8/8/8/8/8/8/1R2K3 b - - 0 1";
    assert.ok(
      !moves(fromFen(board)).includes("a8b8"),
      "по обычным правилам под ладью нельзя",
    );
    assert.ok(moves(fen(board)).includes("a8b8"));
  });

  it("правила игроку объясняют и взятие, и цель", () => {
    const lines = giveawayRules().join(" ");
    assert.match(lines, /обязательно/);
    assert.match(lines, /короля/);
  });
});

describe("поддавки: чем кончается", () => {
  it("короля съели — победа его хозяину", () => {
    const game = new TurboGame(fen("8/8/8/8/8/8/4k3/4K3 w - - 0 1"));
    assert.deepEqual(
      game.legal(),
      [{ from: "e1", to: "e2" }],
      "короля обязаны съесть, даже себе в убыток",
    );

    assert.equal(game.move({ from: "e1", to: "e2" }, 0).ok, true);
    assert.deepEqual(game.outcome(), { result: 1, reason: "kingTaken" });
  });

  it("ходов не осталось — тоже победа", () => {
    // Белые заперты в углу своими же: ни королю, ни пешкам идти некуда.
    const game = new TurboGame(fen("6PK/6PP/8/8/8/8/8/k7 b - - 0 1"));

    assert.equal(game.move({ from: "a1", to: "a2" }, 0).ok, true);
    assert.deepEqual(game.outcome(), { result: 0, reason: "noMoves" });
  });

  it("мата нет: обычный мат партию не кончает", () => {
    const line = [
      ["f2", "f3"],
      ["e7", "e5"],
      ["g2", "g4"],
      ["d8", "h4"],
    ] as const;

    const game = new TurboGame(giveawayPosition());
    for (const [from, to] of line) {
      assert.equal(
        game.move({ from, to }, game.ply()).ok,
        true,
        `${from}${to}`,
      );
    }

    assert.equal(game.isOver(), false);
  });
});

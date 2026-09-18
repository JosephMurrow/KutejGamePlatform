import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromFen } from "../engine/fen";
import { TurboGame } from "../engine/game";
import { classicPosition } from "../engine/position";
import { TOAST_MS, boozePosition, boozeRules } from "./booze";

/**
 * «Алко-шахматы»: окно после взятия живёт в комнате и проверяется там. Движку
 * достаётся только штраф за молчание — по случайной фигуре у обоих.
 */

describe("алко: штраф за молчание", () => {
  it("расстановка и правила обычные — всё особое в комнате", () => {
    assert.deepEqual(boozePosition().board, classicPosition().board);
    assert.equal(TOAST_MS, 30_000);
  });

  it("снимает по фигуре у каждой стороны", () => {
    const game = new TurboGame(boozePosition());
    const before = game.position().board.filter(Boolean).length;

    assert.ok(
      game.punish([0.1, 0.9]) === null,
      "партия от штрафа не кончилась",
    );
    assert.equal(game.position().board.filter(Boolean).length, before - 2);
    assert.equal(game.turn(), 0, "ходом это не считается");
    assert.equal(game.ply(), 0, "и в счёт ходов не идёт");
  });

  it("короля не трогает, даже когда кроме него никого", () => {
    const game = new TurboGame(fromFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"));

    game.punish([0.5, 0.5]);
    assert.equal(game.pieceAt("e1")?.kind, "k", "белый король на месте");
    assert.equal(game.pieceAt("e8")?.kind, "k", "и чёрный тоже");
    assert.equal(game.pieceAt("e2"), null, "а пешка ушла");
  });

  it("правила игроку объясняют окно, штраф и возраст", () => {
    const lines = boozeRules().join(" ");

    assert.match(lines, /полминуты/);
    assert.match(lines, /штраф/);
    assert.match(lines, /18\+/);
  });
});

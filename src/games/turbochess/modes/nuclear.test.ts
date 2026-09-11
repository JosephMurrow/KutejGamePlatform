import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TurboGame } from "../engine/game";
import { piece, type PieceKind } from "../engine/pieces";
import { classicPosition, type Position } from "../engine/position";
import {
  NUCLEAR_FIELD,
  bombReady,
  nuclearCharge,
  nuclearOptions,
  nuclearRules,
  nuclearThreshold,
} from "./nuclear";
import { startPosition } from "./rules";

/**
 * «Ядерные»: шахматы обычные, но за взятые фигуры идут очки, и с порога можно
 * сбросить бомбу. Правила ходов не меняются, поэтому проверяем ручки, счёт
 * очков и сам сброс.
 */

/** Позиция, в которой белые уже съели перечисленное. */
function charged(...kinds: PieceKind[]): Position {
  return {
    ...classicPosition(),
    taken: [kinds.map((kind) => piece(kind, 1)), []],
  };
}

describe("ядерные: ручки", () => {
  it("порог из формы сверяется со списком", () => {
    assert.deepEqual(
      nuclearOptions((name) => (name === NUCLEAR_FIELD ? "30" : null)),
      { threshold: 30 },
    );
    for (const junk of [null, "", "7", "25.5", "двадцать"]) {
      assert.deepEqual(
        nuclearOptions(() => junk),
        { threshold: 25 },
      );
    }
  });

  it("порог из базы тоже сверяется", () => {
    assert.equal(nuclearThreshold({ threshold: 20 }), 20);
    assert.equal(nuclearThreshold({ threshold: 99 }), 25);
    assert.equal(nuclearThreshold({}), 25);
  });

  it("правила для игрока называют выбранный порог", () => {
    assert.ok(
      nuclearRules({ threshold: 30 }).some((line) => line.includes("30")),
    );
    assert.ok(nuclearRules({}).some((line) => line.includes("25")));
  });
});

describe("ядерные: заряд", () => {
  it("очки — по номиналам взятого у соперника", () => {
    assert.equal(nuclearCharge(charged(), 0), 0);
    assert.equal(nuclearCharge(charged("q", "p"), 0), 10);
    assert.equal(nuclearCharge(charged("r", "n", "b"), 0), 11);
  });

  it("бомба готова с порога, не раньше — и заряд у каждого свой", () => {
    const options = { threshold: 20 };

    assert.equal(bombReady(charged("q", "r", "r"), options, 0), false);
    assert.equal(bombReady(charged("q", "r", "r", "p"), options, 0), true);
    assert.equal(
      bombReady(charged("q", "r", "r", "p"), options, 1),
      false,
      "чужие взятия чужой заряд",
    );
  });
});

describe("ядерные: бомба", () => {
  it("сброс кончает партию победой — и только в свой ход", () => {
    const game = new TurboGame(startPosition("NUCLEAR", {}));

    assert.equal(game.dropBomb(1), null, "ходят белые");
    assert.deepEqual(game.dropBomb(0), { result: 0, reason: "nuke" });
    assert.equal(game.dropBomb(0), null, "партия уже кончилась");
  });

  it("расстановка и правила обычные: меняется конец партии, а не доска", () => {
    const position = startPosition("NUCLEAR", { threshold: 20 });

    assert.deepEqual(position.board, classicPosition().board);
    assert.equal(position.rules.goal, "mate");
    assert.equal(position.rules.mustCapture, false);
  });
});

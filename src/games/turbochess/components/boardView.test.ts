import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromFen } from "../engine/fen";
import { legalMoves } from "../engine/moves";
import { classicPosition } from "../engine/position";
import {
  boardPosition,
  checkedKing,
  moveKind,
  pieceType,
  targetsFrom,
} from "./boardView";

describe("доска глазами библиотеки", () => {
  it("расставляет фигуры ключами вида wP и bK", () => {
    const placed = boardPosition(classicPosition());

    assert.equal(Object.keys(placed).length, 32);
    assert.deepEqual(placed.e1, { pieceType: "wK" });
    assert.deepEqual(placed.d8, { pieceType: "bQ" });
    assert.deepEqual(placed.a2, { pieceType: "wP" });
    assert.equal(placed.e4, undefined);
    assert.equal(pieceType({ kind: "n", side: 1 }), "bN");
  });
});

describe("подсветки", () => {
  it("с начала конь g1 может на f3 и h3, и никого не берёт", () => {
    const position = classicPosition();
    const targets = targetsFrom(position, legalMoves(position), "g1");

    assert.deepEqual([...targets.entries()].sort(), [
      ["f3", false],
      ["h3", false],
    ]);
  });

  it("отмечает взятие, в том числе на проходе", () => {
    const position = fromFen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
    const targets = targetsFrom(position, legalMoves(position), "e5");

    assert.deepEqual([...targets.entries()].sort(), [
      ["d6", true],
      ["e6", false],
    ]);
  });

  it("связанной фигуре подсвечивать нечего", () => {
    // Слон e2 связан ладьёй e8 с королём e1.
    const position = fromFen("4r2k/8/8/8/8/8/4B3/4K3 w - - 0 1");
    assert.equal(targetsFrom(position, legalMoves(position), "e2").size, 0);
  });

  it("под шахом называет клетку короля, без шаха — никакую", () => {
    assert.equal(checkedKing(classicPosition()), null);
    assert.equal(checkedKing(fromFen("4k3/8/8/8/8/8/8/4K2r w - - 0 1")), "e1");
  });
});

describe("вид хода", () => {
  it("узнаёт превращение, обычный ход и отсутствие хода", () => {
    const position = fromFen("7k/P7/8/8/8/8/8/K7 w - - 0 1");
    const legal = legalMoves(position);

    assert.equal(moveKind(position, legal, "a7", "a8"), "promotion");
    assert.equal(moveKind(position, legal, "a1", "b1"), "plain");
    assert.equal(moveKind(position, legal, "a1", "c3"), "none");
  });

  it("рокировку принимает и королём на ладью", () => {
    const position = fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const legal = legalMoves(position);

    assert.equal(moveKind(position, legal, "e1", "g1"), "plain");
    assert.equal(moveKind(position, legal, "e1", "h1"), "plain");
    assert.equal(moveKind(position, legal, "e1", "a1"), "plain");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLASSIC,
  offset,
  parseSquare,
  squareAt,
  squareName,
  type Geometry,
} from "./geometry";

const BIG: Geometry = { width: 16, height: 16 };

describe("клетки", () => {
  it("имя и номер клетки переводятся туда и обратно", () => {
    for (const geometry of [CLASSIC, BIG]) {
      for (
        let square = 0;
        square < geometry.width * geometry.height;
        square++
      ) {
        assert.equal(
          parseSquare(geometry, squareName(geometry, square)),
          square,
        );
      }
    }
  });

  it("углы обычной доски — там, где их ждут", () => {
    assert.equal(squareName(CLASSIC, squareAt(CLASSIC, 0, 0)), "a1");
    assert.equal(squareName(CLASSIC, squareAt(CLASSIC, 7, 7)), "h8");
    assert.equal(squareName(CLASSIC, squareAt(CLASSIC, 4, 3)), "e4");
  });

  it("на доске 16×16 есть p16, а на обычной — нет", () => {
    assert.equal(parseSquare(BIG, "p16"), squareAt(BIG, 15, 15));
    assert.equal(parseSquare(CLASSIC, "p16"), null);
    assert.equal(parseSquare(CLASSIC, "i1"), null);
    assert.equal(parseSquare(CLASSIC, "a9"), null);
  });

  it("кривое имя от клиента — не клетка", () => {
    for (const junk of ["", "e", "4e", "a0", "E4", "e04", "e4 ", "ё4", "a-1"]) {
      assert.equal(parseSquare(CLASSIC, junk), null, JSON.stringify(junk));
    }
  });

  it("шаг за край доски — пустота", () => {
    const h1 = squareAt(CLASSIC, 7, 0);
    assert.equal(offset(CLASSIC, h1, [1, 0]), null);
    assert.equal(offset(CLASSIC, h1, [0, -1]), null);
    assert.equal(offset(CLASSIC, h1, [-1, 2]), squareAt(CLASSIC, 6, 2));
  });
});

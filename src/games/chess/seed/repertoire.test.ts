import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import { REPERTOIRE } from "./repertoire";
import { unfold } from "./run";

/**
 * Дебютный репертуар.
 *
 * Линии пишутся руками, и опечатка в них тихая: сид просто пропустит такую
 * линию, а бот на этом уровне останется без книги. Поэтому проверяем, что
 * каждая линия играется целиком.
 */
describe("репертуар ботов", () => {
  it("каждая линия играется до конца", () => {
    for (const [level, lines] of Object.entries(REPERTOIRE)) {
      for (const line of lines) {
        const board = new Chess();
        for (const san of line.split(" ")) {
          assert.doesNotThrow(
            () => board.move(san),
            `${level}: не сыграть ${san} в линии «${line}»`,
          );
        }
      }
    }
  });

  it("у каждого уровня есть чем начать", () => {
    for (const [level, lines] of Object.entries(REPERTOIRE)) {
      assert.ok(lines.length >= 10, `${level}: линий всего ${lines.length}`);
    }
  });

  it("разворачивается в позиции без повторов", () => {
    const rows = unfold();
    const keys = new Set(
      rows.map((row) => `${row.level}:${row.position}:${row.move}`),
    );

    assert.equal(keys.size, rows.length, "одна и та же запись дважды");
    assert.ok(rows.length > 300, `позиций всего ${rows.length}`);
  });

  it("ходы записаны координатами, а не нотацией", () => {
    for (const row of unfold()) {
      assert.match(row.move, /^[a-h][1-8][a-h][1-8][qrbn]?$/, row.move);
    }
  });

  it("начальная позиция известна каждому уровню", () => {
    const start = new Chess().hash();
    const levels = new Set(
      unfold()
        .filter((row) => row.position === start)
        .map((row) => row.level),
    );

    assert.equal(
      levels.size,
      Object.keys(REPERTOIRE).length,
      "кто-то из уровней не знает первого хода",
    );
  });
});

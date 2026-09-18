import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromFen } from "../engine/fen";
import { TurboGame } from "../engine/game";
import { classicPosition, type Position } from "../engine/position";
import { MEGA_NAME, megaPosition, megaRules } from "./mega";

/**
 * «Мега-шахматы»: дошёл до первой горизонтали соперника — получил особые
 * свойства. Проверяем и то, как мега-форма достаётся, и то, как она ходит.
 */

const MEGA = megaPosition().rules;

function fen(text: string): Position {
  return fromFen(text, MEGA);
}

function from(position: Position, square: string): string[] {
  return new TurboGame(position)
    .legal()
    .filter((move) => move.from === square)
    .map((move) => move.to)
    .sort();
}

describe("мега: как достаётся форма", () => {
  it("расстановка обычная — другое только то, что бывает на краю", () => {
    assert.deepEqual(megaPosition().board, classicPosition().board);
    assert.equal(MEGA.mega, true);
  });

  it("превращения нет: дойдя, пешка становится мега-пешкой", () => {
    const game = new TurboGame(fen("4k3/P7/8/8/8/8/8/4K3 w - - 0 1"));
    const moves = game.legal().filter((move) => move.from === "a7");

    assert.deepEqual(
      moves.map((move) => move.promotion ?? null),
      [null],
      "выбора фигуры не спрашивают",
    );

    assert.equal(game.move({ from: "a7", to: "a8" }, 0).ok, true);
    assert.equal(game.pieceAt("a8")?.kind, "p");
    assert.equal(game.pieceAt("a8")?.mega, true);
  });

  it("король мега-формы не получает — он этим выигрывает", () => {
    const game = new TurboGame(fen("8/4K3/8/k7/8/8/8/8 w - - 0 1"));

    assert.equal(game.move({ from: "e7", to: "e8" }, 0).ok, true);
    assert.deepEqual(
      game.outcome(),
      { result: 0, reason: "throne" },
      "дошёл до первой горизонтали соперника",
    );
  });
});

describe("мега: как ходят формы", () => {
  it("мега-пешка ходит вперёд и назад, бьёт в обе стороны", () => {
    const game = new TurboGame(fen("4k3/8/8/8/2p1p3/3P4/8/4K3 w - - 0 1"));
    const mega = {
      ...game.position(),
      board: game
        .position()
        .board.map((cell, square) =>
          square === 19 && cell ? { ...cell, mega: true } : cell,
        ),
    };

    const moves = from(mega, "d3");
    assert.ok(moves.includes("d4"), "вперёд");
    assert.ok(moves.includes("d2"), "назад");
    assert.ok(moves.includes("c4") && moves.includes("e4"), "бьёт вперёд");
  });

  it("мега-конь прыгает малой буквой Г и большой", () => {
    const board = fen("4k3/8/8/8/3N4/8/8/4K3 w - - 0 1");
    const mega = {
      ...board,
      board: board.board.map((cell) =>
        cell?.kind === "n" ? { ...cell, mega: true } : cell,
      ),
    };

    assert.equal(from(board, "d4").length, 8);
    assert.ok(from(mega, "d4").includes("f7"), "два на три");
    assert.ok(from(mega, "d4").includes("b5"), "и обычный прыжок на месте");
  });

  it("пушка перепрыгивает ровно одну фигуру", () => {
    // Король в стороне: пешка на d2 иначе держала бы его под шахом, и все
    // ходы считались бы только защитой.
    const board = fen("4k3/8/8/8/3p4/8/3p4/3R1K2 w - - 0 1");
    const cannon = {
      ...board,
      board: board.board.map((cell) =>
        cell?.kind === "r" ? { ...cell, mega: true } : cell,
      ),
    };

    const moves = from(cannon, "d1");
    assert.ok(moves.includes("d2"), "до преграды — как ладья");
    assert.ok(moves.includes("d3"), "за преградой — прыжком");
    assert.ok(moves.includes("d4"), "и бьёт первую за ней");
    assert.ok(!moves.includes("d5"), "через две — нельзя");
  });

  it("амазонка ходит и конём, мега-слон — на клетку по прямой", () => {
    const queen = fen("4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1");
    const amazon = {
      ...queen,
      board: queen.board.map((cell) =>
        cell?.kind === "q" ? { ...cell, mega: true } : cell,
      ),
    };
    assert.ok(from(amazon, "d4").includes("e6"), "ход конём");

    const bishop = fen("4k3/8/8/8/3B4/8/8/4K3 w - - 0 1");
    const mega = {
      ...bishop,
      board: bishop.board.map((cell) =>
        cell?.kind === "b" ? { ...cell, mega: true } : cell,
      ),
    };
    assert.ok(from(mega, "d4").includes("d5"), "на клетку по прямой");
  });

  it("формы названы по-человечески, и правила их перечисляют", () => {
    assert.equal(MEGA_NAME.r, "пушка");
    assert.equal(MEGA_NAME.q, "амазонка");
    assert.match(megaRules().join(" "), /Пушка/);
  });
});

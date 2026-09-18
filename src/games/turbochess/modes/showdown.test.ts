import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TurboGame } from "../engine/game";
import { parseSquare, squareName } from "../engine/geometry";
import { classicPosition } from "../engine/position";
import {
  showdownNote,
  showdownPosition,
  showdownRules,
  showdownStart,
  showdownSwap,
  showdownZone,
} from "./showdown";

/**
 * «Вскрываемся»: расстановка вслепую на своих двух горизонталях. Сама фаза
 * живёт в комнате и проверяется там; здесь — зона, обмен местами и позиция,
 * которая из них собирается.
 */

/** Зона именами клеток — так её видно глазами. */
function zone(side: number): string[] {
  const geometry = classicPosition().geometry;
  return showdownZone(side, geometry).map((square) =>
    squareName(geometry, square),
  );
}

describe("вскрываемся: зона и расстановка", () => {
  it("зона — шестнадцать своих клеток, первой горизонталью вперёд", () => {
    assert.equal(zone(0).length, 16);
    assert.deepEqual(zone(0).slice(0, 8), [
      "a1",
      "b1",
      "c1",
      "d1",
      "e1",
      "f1",
      "g1",
      "h1",
    ]);
    assert.deepEqual(zone(0).slice(8), [
      "a2",
      "b2",
      "c2",
      "d2",
      "e2",
      "f2",
      "g2",
      "h2",
    ]);
    assert.deepEqual(zone(1).slice(0, 8), [
      "a8",
      "b8",
      "c8",
      "d8",
      "e8",
      "f8",
      "g8",
      "h8",
    ]);
    assert.deepEqual(zone(1).slice(8), [
      "a7",
      "b7",
      "c7",
      "d7",
      "e7",
      "f7",
      "g7",
      "h7",
    ]);
  });

  it("кто ничего не тронул, играет обычными шахматами", () => {
    const position = showdownPosition([showdownStart(), showdownStart()]);

    assert.deepEqual(position.board, classicPosition().board);
    assert.deepEqual(position.castling, [], "рокировки в режиме нет вовсе");
  });

  it("чужую расстановку можно не класть — её половина пуста", () => {
    const position = showdownPosition([showdownStart(), null]);
    const empty = zone(1).every(
      (square) => new TurboGame(position).pieceAt(square) === null,
    );

    assert.ok(empty, "до вскрытия чужой половины не видно");
    assert.equal(new TurboGame(position).pieceAt("e1")?.kind, "k");
  });
});

describe("вскрываемся: обмен местами", () => {
  it("меняет две фигуры и не трогает остальные", () => {
    const swapped = showdownSwap(showdownStart(), 0, 1);

    assert.equal(swapped?.[0], "n");
    assert.equal(swapped?.[1], "r");
    assert.deepEqual(swapped?.slice(2), showdownStart().slice(2));
  });

  it("король не уезжает со своей первой горизонтали", () => {
    assert.equal(showdownSwap(showdownStart(), 4, 12), null, "король вниз");
    assert.equal(showdownSwap(showdownStart(), 12, 4), null, "пешка наверх");
    assert.ok(showdownSwap(showdownStart(), 4, 0), "по первой — можно");
  });

  it("клетка не из зоны и та же самая клетка — не обмен", () => {
    assert.equal(showdownSwap(showdownStart(), -1, 3), null);
    assert.equal(showdownSwap(showdownStart(), 3, 99), null);
    assert.equal(showdownSwap(showdownStart(), 3, 3), null);
  });

  it("пешка с первой горизонтали ходит на одну клетку", () => {
    const arrangement = showdownSwap(showdownStart(), 0, 8) ?? [];
    const start = showdownPosition([arrangement, null]);
    // Пешке с первой горизонтали нужно, чтобы перед ней освободилось: в начале
    // там стоит своя же фигура.
    const board = [...start.board];
    board[parseSquare(start.geometry, "a2") ?? 0] = null;
    const game = new TurboGame({ ...start, board });
    const steps = game
      .legal()
      .filter((move) => move.from === "a1")
      .map((move) => move.to);

    assert.deepEqual(steps, ["a2"], "двойной шаг — только со второй");
  });
});

describe("вскрываемся: запись и правила", () => {
  it("расстановка пишется строкой — по ней партию и перемотают", () => {
    const note = showdownNote([showdownStart(), showdownStart()]);

    assert.equal(note, "rnbqkbnrpppppppp/rnbqkbnrpppppppp");
  });

  it("правила игроку называют короля, рубашку и вскрытие", () => {
    const lines = showdownRules().join(" ");

    assert.match(lines, /Король — только на первой/);
    assert.match(lines, /рубашкой/);
    assert.match(lines, /Рокировки нет/);
  });
});

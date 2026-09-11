import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import { fromFen } from "../engine/fen";
import { inCheck, legalMoves, play } from "../engine/moves";
import type { Position } from "../engine/position";
import {
  ONE_KINDS,
  oneKindOf,
  oneKindOptions,
  oneKindPosition,
  oneKindRules,
  type OneKind,
} from "./oneKind";

/**
 * «Одним видом фигур»: расстановка и её сверка с `chess.js`. Правила ходов
 * здесь обычные, так что библиотека может проверить всё — если позиция та же,
 * что задумана, и если свой движок с ней справляется.
 */

/** Та же расстановка записью FEN — для библиотеки. */
const FEN: Record<OneKind, string> = {
  q: "qqqqkqqq/qqqqqqqq/8/8/8/8/QQQQQQQQ/QQQQKQQQ w - - 0 1",
  r: "rrrrkrrr/rrrrrrrr/8/8/8/8/RRRRRRRR/RRRRKRRR w KQkq - 0 1",
  n: "nnnnknnn/nnnnnnnn/8/8/8/8/NNNNNNNN/NNNNKNNN w - - 0 1",
  b: "bbbbkbbb/bbbbbbbb/8/8/8/8/BBBBBBBB/BBBBKBBB w - - 0 1",
  p: "4k3/pppppppp/pppp1ppp/8/8/PPPP1PPP/PPPPPPPP/4K3 w - - 0 1",
};

function perft(position: Position, depth: number): number {
  const legal = legalMoves(position);
  if (depth === 1) return legal.length;

  let nodes = 0;
  for (const move of legal) nodes += perft(play(position, move), depth - 1);
  return nodes;
}

function count(position: Position, side: number) {
  const kinds: Record<string, number> = {};
  for (const cell of position.board) {
    if (cell?.side === side) kinds[cell.kind] = (kinds[cell.kind] ?? 0) + 1;
  }
  return kinds;
}

describe("расстановка одним видом фигур", () => {
  it("у каждой стороны король и пятнадцать фигур выбранного вида", () => {
    for (const kind of ONE_KINDS) {
      const position = oneKindPosition(kind);
      for (const side of [0, 1]) {
        assert.deepEqual(count(position, side), { k: 1, [kind]: 15 }, kind);
      }
    }
  });

  it("совпадает с задуманной — клетка в клетку", () => {
    for (const kind of ONE_KINDS) {
      assert.deepEqual(
        oneKindPosition(kind).board,
        fromFen(FEN[kind]).board,
        kind,
      );
    }
  });

  it("рокировка есть только у ладей: в углах больше никто не стоит", () => {
    for (const kind of ONE_KINDS) {
      assert.equal(
        oneKindPosition(kind).castling.length,
        kind === "r" ? 4 : 0,
        kind,
      );
    }
  });

  it("на старте шаха нет, и белым есть чем ходить", () => {
    for (const kind of ONE_KINDS) {
      const position = oneKindPosition(kind);
      assert.equal(inCheck(position, 0), false, kind);
      assert.equal(inCheck(position, 1), false, kind);
      assert.ok(legalMoves(position).length > 0, kind);
    }
  });

  it("perft сходится с chess.js на каждой расстановке", () => {
    for (const kind of ONE_KINDS) {
      // Пятнадцать ферзей и ладей ветвятся так, что на три полухода дерево
      // считалось бы минутами; им хватает двух.
      const depth = kind === "q" || kind === "r" ? 2 : 3;
      assert.equal(
        perft(oneKindPosition(kind), depth),
        new Chess(FEN[kind]).perft(depth),
        kind,
      );
    }
  });
});

describe("ручки режима", () => {
  it("вид берётся из формы, мусор становится ферзями", () => {
    assert.deepEqual(
      oneKindOptions((name) => (name === "oneKind" ? "n" : null)),
      { kind: "n" },
    );
    for (const junk of [null, "", "k", "Q", 5]) {
      assert.deepEqual(
        oneKindOptions(() => junk),
        { kind: "q" },
      );
    }
  });

  it("вид из базы тоже сверяется", () => {
    assert.equal(oneKindOf({ kind: "b" }), "b");
    assert.equal(oneKindOf({ kind: "k" }), "q", "короли не бывают видом");
    assert.equal(oneKindOf({}), "q");
  });

  it("правила называют вид, а у пешек объясняют расстановку", () => {
    assert.match(oneKindRules({ kind: "n" })[0] ?? "", /кони/);
    assert.ok(
      oneKindRules({ kind: "p" }).some((line) => line.includes("третьей")),
    );
  });
});

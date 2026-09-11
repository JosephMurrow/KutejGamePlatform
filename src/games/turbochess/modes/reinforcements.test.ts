import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromFen } from "../engine/fen";
import { TurboGame } from "../engine/game";
import { repetitionKey } from "../engine/moves";
import type { PieceKind } from "../engine/pieces";
import { classicPosition, type Position } from "../engine/position";
import {
  REINFORCEMENT_KINDS,
  reinforcementsPosition,
  reinforcementsRules,
} from "./reinforcements";

/**
 * «Подкрепление»: у каждого запас, и вывести из него фигуру — ход. Механика
 * общая с зомби, поэтому здесь проверяется само выставление: куда можно, чего
 * нельзя и что при этом происходит с запасом.
 */

/** Позиция из FEN с запасом у белых. */
function stocked(fen: string, white: PieceKind[]): Position {
  return { ...fromFen(fen), reserve: [white, []] };
}

/** Выставления записью «вид-клетка». */
function drops(position: Position): string[] {
  return new TurboGame(position)
    .legal()
    .flatMap((move) => (move.drop ? [`${move.drop}${move.to}`] : []))
    .sort();
}

describe("подкрепление: запас", () => {
  it("у каждого по одной фигуре каждого вида, кроме короля", () => {
    const position = reinforcementsPosition();

    assert.deepEqual(position.reserve, [
      [...REINFORCEMENT_KINDS],
      [...REINFORCEMENT_KINDS],
    ]);
    assert.deepEqual(position.board, classicPosition().board);
    assert.ok(!REINFORCEMENT_KINDS.includes("k"), "короля в запасе не бывает");
  });

  it("в начале ставить некуда: обе горизонтали заняты", () => {
    assert.deepEqual(drops(reinforcementsPosition()), []);
  });

  it("правила игроку объясняют запас и что вызов — это ход", () => {
    const lines = reinforcementsRules().join(" ");
    assert.match(lines, /запас/);
    assert.match(lines, /вместо хода/);
  });
});

describe("подкрепление: выставление", () => {
  it("ставят на свои две горизонтали, и это ход", () => {
    const game = new TurboGame(stocked("4k3/8/8/8/8/8/8/4K3 w - - 0 1", ["q"]));

    const result = game.move({ drop: "q", to: "a2" }, 0);
    assert.equal(result.ok, true);
    assert.equal(game.turn(), 1, "выставление стоит хода");
    assert.deepEqual(game.position().reserve[0], [], "фигура ушла из запаса");
    assert.equal(game.pieceAt("a2")?.kind, "q");
    assert.equal(game.pieceAt("a2")?.side, 0);
    assert.equal(
      game.history().at(-1),
      "Q@a2",
      "записывается как в крейзихаусе",
    );
  });

  it("на чужую половину и на занятую клетку не поставить", () => {
    const targets = drops(stocked("4k3/8/8/8/8/8/8/4K3 w - - 0 1", ["r"]));

    assert.ok(targets.includes("ra1"));
    assert.ok(targets.includes("rh2"));
    assert.ok(!targets.includes("re1"), "на своего короля не ставят");
    assert.ok(
      targets.every((target) => target.endsWith("1") || target.endsWith("2")),
      "только свои две горизонтали",
    );
  });

  it("пешку на первую горизонталь не ставят", () => {
    const targets = drops(stocked("4k3/8/8/8/8/8/8/4K3 w - - 0 1", ["p"]));

    assert.ok(targets.includes("pa2"));
    assert.ok(!targets.includes("pa1"));
  });

  it("чёрные ставят на свои две горизонтали, а не на белые", () => {
    const position: Position = {
      ...fromFen("4k3/8/8/8/8/8/8/4K3 b - - 0 1"),
      reserve: [[], ["q"]],
    };

    assert.ok(drops(position).includes("qa7"));
    assert.ok(!drops(position).includes("qa2"));
  });

  it("выставленная фигура бьёт сразу", () => {
    const game = new TurboGame(stocked("7k/8/8/8/8/8/8/4K3 w - - 0 1", ["q"]));

    assert.equal(game.move({ drop: "q", to: "h2" }, 0).ok, true);
    assert.equal(game.moves().at(-1)?.check, true);
    assert.equal(game.history().at(-1), "Q@h2+");
  });

  it("под шахом выставляют только в защиту", () => {
    const targets = drops(stocked("4r2k/8/8/8/8/8/8/4K3 w - - 0 1", ["b"]));

    assert.deepEqual(targets, ["be2"], "закрыться от ладьи можно только на e2");
  });

  it("запас входит в ключ повторения", () => {
    const bare = fromFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    const withQueen: Position = { ...bare, reserve: [["q"], []] };

    assert.notEqual(repetitionKey(bare), repetitionKey(withQueen));
  });
});

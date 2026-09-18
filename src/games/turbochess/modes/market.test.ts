import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromFen } from "../engine/fen";
import { TurboGame } from "../engine/game";
import { piece, type Piece } from "../engine/pieces";
import { classicPosition, type Position } from "../engine/position";
import {
  MARKET_PRICE,
  marketPosition,
  marketPrice,
  marketRules,
  pointsLeft,
  revivable,
} from "./market";

/**
 * «Чёрный рынок»: очки за взятые фигуры тратятся в магазине. Проверяем прайс,
 * счёт очков и каждую покупку — что она делает и чего не даёт сделать.
 */

/** Позиция с очками: столько-то уже забрано у соперника. */
function rich(fen: string, mine: number): Position {
  const base = fromFen(fen);
  return {
    ...base,
    // Девять очков — ферзь; больше и не нужно ни на что в прайсе.
    taken: [Array.from({ length: mine }, () => piece("q", 1)), []],
    spent: [0, 0],
    extra: [0, 0],
  };
}

describe("рынок: прайс и очки", () => {
  it("цены как в постановке, воскрешение — по номиналу", () => {
    assert.deepEqual(marketPosition().board, classicPosition().board);
    assert.equal(marketPrice("extra"), 4);
    assert.equal(marketPrice("shield"), 5);
    assert.equal(marketPrice("relocate"), 6);
    assert.equal(marketPrice("swap"), 7);
    assert.equal(marketPrice("revive", "q"), 9 + MARKET_PRICE.revive);
    assert.equal(marketPrice("revive", "p"), 1 + MARKET_PRICE.revive);
  });

  it("очки — набранное минус потраченное", () => {
    const position = rich("4k3/8/8/8/8/8/8/4K3 w - - 0 1", 1);

    assert.equal(pointsLeft(position, 0), 9);
    assert.equal(pointsLeft({ ...position, spent: [4, 0] }, 0), 5);
    assert.equal(pointsLeft(position, 1), 0, "чёрные ничего не брали");
  });

  it("воскрешать можно то, что забрал соперник, без повторов", () => {
    const position: Position = {
      ...classicPosition(),
      taken: [[], [piece("p", 0), piece("p", 0), piece("r", 0)]],
    };

    assert.deepEqual(revivable(position, 0).sort(), ["p", "r"]);
    assert.deepEqual(revivable(position, 1), [], "у чёрных не брали ничего");
  });

  it("правила называют прайс и то, что покупка не тратит ход", () => {
    const lines = marketRules().join(" ");

    assert.match(lines, /магазин/);
    assert.match(lines, /не тратит ход/);
    assert.match(lines, /Очки живут одну партию/);
  });
});

describe("рынок: покупки", () => {
  it("дополнительный ход оставляет очередь за собой", () => {
    const game = new TurboGame(rich("4k3/8/8/8/8/8/R7/4K3 w - - 0 1", 1));

    assert.equal(game.market(0, { item: "extra" }, 4), true);
    assert.equal(game.position().spent[0], 4, "очки списаны");
    assert.equal(game.turn(), 0, "покупка ходом не считается");

    assert.equal(game.move({ from: "a2", to: "a3" }, 0).ok, true);
    assert.equal(game.turn(), 0, "ходим ещё раз");

    assert.equal(game.move({ from: "a3", to: "a4" }, 1).ok, true);
    assert.equal(game.turn(), 1, "а теперь очередь ушла");
  });

  it("щит ставится на свою фигуру и только один раз", () => {
    const game = new TurboGame(rich("4k3/8/8/8/8/8/R7/4K3 w - - 0 1", 2));

    assert.equal(game.market(0, { item: "shield", from: "a2" }, 5), true);
    assert.equal(game.pieceAt("a2")?.shield, true);
    assert.equal(
      game.market(0, { item: "shield", from: "a2" }, 5),
      false,
      "второй щит той же фигуре не нужен",
    );
    assert.equal(
      game.market(0, { item: "shield", from: "e8" }, 5),
      false,
      "чужую фигуру не прикрыть",
    );
  });

  it("перестановка и обмен двигают только свои фигуры", () => {
    const game = new TurboGame(rich("4k3/8/8/8/8/8/R7/4K3 w - - 0 1", 3));

    assert.equal(
      game.market(0, { item: "relocate", from: "a2", to: "e1" }, 6),
      false,
      "занятую клетку не занять",
    );
    assert.equal(
      game.market(0, { item: "relocate", from: "a2", to: "h5" }, 6),
      true,
    );
    assert.equal(game.pieceAt("h5")?.kind, "r");

    assert.equal(
      game.market(0, { item: "swap", from: "h5", to: "e1" }, 7),
      true,
    );
    assert.equal(game.pieceAt("e1")?.kind, "r");
    assert.equal(game.pieceAt("h5")?.kind, "k");
  });

  it("воскрешают только забранное и только на свою половину", () => {
    const base = fromFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    const game = new TurboGame({
      ...base,
      taken: [[], [piece("n", 0), piece("p", 0)]],
      spent: [0, 0],
      extra: [0, 0],
    });

    assert.equal(
      game.market(0, { item: "revive", kind: "q", to: "a1" }, 12),
      false,
      "ферзя у нас не брали",
    );
    assert.equal(
      game.market(0, { item: "revive", kind: "n", to: "a5" }, 6),
      false,
      "чужая половина не годится",
    );
    assert.equal(
      game.market(0, { item: "revive", kind: "p", to: "a1" }, 4),
      false,
      "пешку на первую горизонталь не ставят",
    );

    assert.equal(
      game.market(0, { item: "revive", kind: "n", to: "a1" }, 6),
      true,
    );
    assert.equal(game.pieceAt("a1")?.kind, "n");
    assert.deepEqual(
      revivable(game.position(), 0),
      ["p"],
      "поднятая фигура из могилы ушла",
    );
  });
});

describe("рынок: щит в бою", () => {
  it("взятие отбито, рубящий на месте, щит сгорел", () => {
    const base = fromFen("4k3/8/8/4p3/8/3N4/8/4K3 w - - 0 1");
    const guarded: Piece = piece("p", 1, { shield: true });
    const game = new TurboGame({
      ...base,
      board: base.board.map((cell) =>
        cell?.kind === "p" && cell.side === 1 ? guarded : cell,
      ),
    });

    assert.equal(game.move({ from: "d3", to: "e5" }, 0).ok, true);
    assert.equal(game.pieceAt("d3")?.kind, "n", "конь вернулся назад");
    assert.equal(game.pieceAt("e5")?.kind, "p", "пешка цела");
    assert.equal(game.pieceAt("e5")?.shield, undefined, "а щит сгорел");
    assert.equal(game.history().at(-1), "Nxe5^", "в записи это видно");
    assert.deepEqual(game.position().taken[0], [], "взятого нет");
    assert.equal(game.turn(), 1, "ход при этом потрачен");
  });
});

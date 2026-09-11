import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromFen } from "../engine/fen";
import { TurboGame } from "../engine/game";
import { piece } from "../engine/pieces";
import {
  STALL_PLIES,
  classicPosition,
  type Position,
} from "../engine/position";
import { annihilationPosition, stallLeft, takenCount } from "./annihilation";

/**
 * «На уничтожение»: мата нет, цель — снять с доски всё. Проверяем то, чем
 * режим отличается от обычных шахмат, — и рядом те же позиции по обычным
 * правилам, чтобы разница была видна, а не подразумевалась.
 */

/** Правила режима берём из его же расстановки, а не переписываем в тесте. */
const WIPE = annihilationPosition().rules;

/** Позиция из FEN по правилам режима. */
function fen(text: string): Position {
  return fromFen(text, WIPE);
}

/** Законные ходы записью «откуда-куда». */
function moves(position: Position): string[] {
  return new TurboGame(position)
    .legal()
    .map((move) => `${move.from}${move.to}`);
}

describe("на уничтожение: правила", () => {
  it("расстановка обычная — другая только цель партии", () => {
    assert.deepEqual(annihilationPosition().board, classicPosition().board);
    assert.equal(annihilationPosition().rules.goal, "wipe");
    assert.equal(annihilationPosition().rules.mustCapture, false);
  });

  it("шаха нет: королём ходят и под бой", () => {
    const board = "4k3/8/8/8/8/8/8/3RK3 b - - 0 1";
    assert.ok(
      !moves(fromFen(board)).includes("e8d8"),
      "по обычным правилам под ладью нельзя",
    );
    assert.ok(moves(fen(board)).includes("e8d8"));
  });

  it("рокировка идёт и через битое поле", () => {
    const board = "4k3/8/8/8/8/8/5r2/4K2R w K - 0 1";
    assert.ok(
      !moves(fromFen(board)).includes("e1g1"),
      "по обычным правилам через f2 нельзя",
    );
    assert.ok(moves(fen(board)).includes("e1g1"));
  });

  it("превращение обычное: ферзь, ладья, слон, конь — и всё", () => {
    const legal = new TurboGame(fen("4k3/P7/8/8/8/8/8/4K3 w - - 0 1"))
      .legal()
      .filter((move) => move.from === "a7");

    assert.deepEqual(legal.map((move) => move.promotion).sort(), [
      "b",
      "n",
      "q",
      "r",
    ]);
  });

  it("ничью по повторению и полусотне ходов тут не требуют", () => {
    const board = fromFen("4k3/8/8/8/8/8/8/R3K3 w - - 0 1");
    assert.equal(
      new TurboGame({ ...board, quiet: 120 }).claimableDraw(),
      "fiftyMoves",
    );
    assert.equal(
      new TurboGame({ ...board, quiet: 120, rules: WIPE }).claimableDraw(),
      null,
    );
  });
});

describe("на уничтожение: чем кончается", () => {
  it("мат партию не кончает", () => {
    const line = [
      ["f2", "f3"],
      ["e7", "e5"],
      ["g2", "g4"],
      ["d8", "h4"],
    ] as const;

    const classic = new TurboGame();
    const wipe = new TurboGame(annihilationPosition());
    for (const [from, to] of line) {
      assert.equal(classic.move({ from, to }, classic.ply()).ok, true);
      assert.equal(wipe.move({ from, to }, wipe.ply()).ok, true);
    }

    assert.equal(classic.outcome()?.reason, "checkmate");
    assert.equal(wipe.isOver(), false);
    assert.ok(
      !(wipe.history().at(-1) ?? "").includes("#"),
      "и шаха в записи нет",
    );
  });

  it("снял с доски всё — победа", () => {
    const game = new TurboGame(fen("6Rk/8/8/8/8/8/8/4K3 w - - 0 1"));

    assert.equal(game.move({ from: "g8", to: "h8" }, 0).ok, true);
    assert.deepEqual(game.outcome(), { result: 0, reason: "wiped" });
  });

  it("полсотни полуходов без взятий — остановка и счёт по взятым", () => {
    const board = fen("4k3/8/8/8/8/8/8/R3K3 w - - 0 1");
    const game = new TurboGame({
      ...board,
      sinceCapture: STALL_PLIES - 1,
      taken: [[piece("p", 1), piece("n", 1)], [piece("p", 0)]],
    });

    assert.equal(game.move({ from: "a1", to: "a2" }, 0).ok, true);
    assert.deepEqual(game.outcome(), { result: 0, reason: "counted" });
  });

  it("поровну взятых — ничья", () => {
    const board = fen("4k3/8/8/8/8/8/8/R3K3 w - - 0 1");
    const game = new TurboGame({
      ...board,
      sinceCapture: STALL_PLIES - 1,
      taken: [[piece("n", 1)], [piece("p", 0)]],
    });

    assert.equal(game.move({ from: "a1", to: "a2" }, 0).ok, true);
    assert.deepEqual(game.outcome(), { result: "draw", reason: "counted" });
  });

  it("ходить нечем — не пат, а тот же счёт по взятым", () => {
    // Белые заперты в углу своими же: пешке на последней горизонтали идти
    // некуда, королю — тоже. Ходят чёрные, и после их хода партия встаёт.
    const board = fen("6PK/6PP/8/8/8/8/8/k7 b - - 0 1");
    const game = new TurboGame({ ...board, taken: [[], [piece("p", 0)]] });

    assert.equal(game.move({ from: "a1", to: "a2" }, 0).ok, true);
    assert.deepEqual(game.outcome(), { result: 1, reason: "counted" });
  });
});

describe("на уничтожение: счётчики", () => {
  it("считают снятые фигуры и остаток до остановки", () => {
    const position: Position = {
      ...fen("4k3/8/8/8/8/8/8/R3K3 w - - 0 1"),
      sinceCapture: 42,
      taken: [[piece("p", 1), piece("q", 1)], []],
    };

    assert.equal(takenCount(position, 0), 2);
    assert.equal(takenCount(position, 1), 0);
    assert.equal(stallLeft(position), STALL_PLIES - 42);
  });

  it("взятие возвращает счётчик к началу", () => {
    const game = new TurboGame({
      ...fen("4k3/8/8/8/8/8/r7/R3K3 w - - 0 1"),
      sinceCapture: 30,
    });

    assert.equal(game.move({ from: "a1", to: "a2" }, 0).ok, true);
    assert.equal(stallLeft(game.position()), STALL_PLIES);
    assert.equal(takenCount(game.position(), 0), 1);
  });
});

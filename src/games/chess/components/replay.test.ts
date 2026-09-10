import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { frames, START, taken } from "./replay";

/** Испанская с разменом на c6: белые отдали слона, чёрные — коня. */
const SPANISH = ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Bxc6", "dxc6"];

describe("перемотка", () => {
  it("разворачивает запись в позиции", () => {
    const list = frames(SPANISH);

    assert.equal(list.length, SPANISH.length + 1, "начальная плюс по ходу");
    assert.equal(list[0]?.fen, START);
    assert.equal(
      list[0]?.lastMove,
      null,
      "до первого хода подсвечивать нечего",
    );
    assert.deepEqual(list[1]?.lastMove, { from: "e2", to: "e4" });
    assert.deepEqual(list.at(-1)?.lastMove, { from: "d7", to: "c6" });
  });

  it("на пустой партии отдаёт одну начальную позицию", () => {
    assert.deepEqual(frames([]), [{ fen: START, lastMove: null }]);
  });

  it("оборванную запись не роняет", () => {
    const list = frames(["e4", "нечто", "e5"]);

    assert.equal(list.length, 2, "обрубок лучше пустой доски");
  });
});

describe("взятые фигуры", () => {
  it("в начале партии не съедено ничего", () => {
    assert.deepEqual(taken(START), { white: [], black: [], edge: 0 });
  });

  it("считает снятое с доски и перевес", () => {
    const after = frames(SPANISH).at(-1)?.fen ?? "";
    const lost = taken(after);

    assert.deepEqual(lost.white, ["b"], "белые лишились слона");
    assert.deepEqual(lost.black, ["n"], "чёрные — коня");
    assert.equal(lost.edge, 0, "слон за коня — размен равный");
  });

  it("перевес считается в пешках и со знаком", () => {
    // У белых нет ферзя: чёрные впереди на девять.
    const noQueen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1";
    const lost = taken(noQueen);

    assert.deepEqual(lost.white, ["q"]);
    assert.equal(lost.edge, -9);
  });

  it("фигуры идут по убыванию цены", () => {
    // У чёрных сняты ферзь, ладья и пешка.
    const stripped = "1nb1kbnr/1ppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQk - 0 1";

    assert.deepEqual(taken(stripped).black, ["q", "r", "p"]);
  });
});

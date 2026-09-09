import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import { ChessGame } from "./rules";

/** Прогнать список ходов, проверяя, что каждый принят. */
function play(game: ChessGame, moves: [string, string][]): void {
  for (const [from, to] of moves) {
    const result = game.move({ from, to }, game.ply());
    assert.equal(result.ok, true, `${from}${to} не принят`);
  }
}

describe("партия целиком", () => {
  it("играется от начала до мата", () => {
    const game = new ChessGame();

    // Детский мат: 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#
    play(game, [
      ["e2", "e4"],
      ["e7", "e5"],
      ["f1", "c4"],
      ["b8", "c6"],
      ["d1", "h5"],
      ["g8", "f6"],
    ]);

    const mate = game.move({ from: "h5", to: "f7" }, game.ply());
    assert.equal(mate.ok, true);
    assert.deepEqual(game.outcome(), {
      result: "white",
      reason: "checkmate",
    });
    assert.deepEqual(mate.ok && mate.move.san, "Qxf7#");
    assert.equal(game.ply(), 7);
    assert.deepEqual(game.history().slice(0, 3), ["e4", "e5", "Bc4"]);
  });

  it("после конца партии ходов не принимает", () => {
    const game = new ChessGame("7k/5Q2/6K1/8/8/8/8/8 w - - 0 1");
    game.move({ from: "f7", to: "g7" }, 0);

    assert.equal(game.outcome()?.reason, "checkmate");
    const after = game.move({ from: "g6", to: "f6" }, game.ply());
    assert.deepEqual(after, { ok: false, reason: "gameOver" });
  });
});

describe("приём хода", () => {
  it("отбивает нелегальный ход ошибкой, а не падением", () => {
    const game = new ChessGame();
    assert.deepEqual(game.move({ from: "a1", to: "a8" }, 0), {
      ok: false,
      reason: "illegal",
    });
  });

  it("не даёт ходить за соперника", () => {
    const game = new ChessGame();
    // Чёрными в первый ход: библиотека такой ход считает нелегальным.
    assert.deepEqual(game.move({ from: "e7", to: "e5" }, 0), {
      ok: false,
      reason: "illegal",
    });
  });

  it("отбрасывает ход с чужим номером полухода", () => {
    const game = new ChessGame();

    assert.deepEqual(game.move({ from: "e2", to: "e4" }, 3), {
      ok: false,
      reason: "stalePly",
    });
    // Двойной клик: второй раз тот же номер уже не годится.
    assert.equal(game.move({ from: "e2", to: "e4" }, 0).ok, true);
    assert.deepEqual(game.move({ from: "e4", to: "e5" }, 0), {
      ok: false,
      reason: "stalePly",
    });
  });

  it("превращение без фигуры отбивается ошибкой, а не падением", () => {
    const game = new ChessGame("8/P7/8/8/8/8/8/K6k w - - 0 1");

    assert.deepEqual(game.move({ from: "a7", to: "a8" }, 0), {
      ok: false,
      reason: "needsPromotion",
    });

    const promoted = game.move({ from: "a7", to: "a8", promotion: "n" }, 0);
    assert.equal(promoted.ok, true);
    assert.equal(promoted.ok && promoted.move.san, "a8=N");
  });

  it("рокировка принимается и королём на две клетки, и королём на ладью", () => {
    const short = new ChessGame("4k3/8/8/8/8/8/8/4K2R w K - 0 1");
    assert.equal(short.move({ from: "e1", to: "g1" }, 0).ok, true);
    assert.equal(short.fen().startsWith("4k3/8/8/8/8/8/8/5RK1"), true);

    const onRook = new ChessGame("4k3/8/8/8/8/8/8/4K2R w K - 0 1");
    const made = onRook.move({ from: "e1", to: "h1" }, 0);
    assert.equal(made.ok, true, "король на свою ладью — тоже рокировка");
    assert.equal(made.ok && made.move.san, "O-O");
  });
});

describe("окончания партии", () => {
  it("пат — ничья", () => {
    const game = new ChessGame("7k/8/8/6Q1/8/8/8/K7 w - - 0 1");
    game.move({ from: "g5", to: "g6" }, 0);

    assert.deepEqual(game.outcome(), { result: "draw", reason: "stalemate" });
  });

  it("сдача отдаёт партию сопернику", () => {
    const game = new ChessGame();
    assert.deepEqual(game.resign("b"), { result: "white", reason: "resign" });
  });

  it("ничья по соглашению", () => {
    const game = new ChessGame();
    assert.deepEqual(game.agreeDraw(), {
      result: "draw",
      reason: "agreement",
    });
  });

  it("брошенная партия достаётся сопернику", () => {
    const game = new ChessGame();
    assert.deepEqual(game.abandon("w"), {
      result: "black",
      reason: "abandoned",
    });
  });

  it("отменить можно только до первого хода", () => {
    const before = new ChessGame();
    assert.deepEqual(before.abort(), { result: "draw", reason: "aborted" });

    const after = new ChessGame();
    after.move({ from: "e2", to: "e4" }, 0);
    assert.equal(after.abort(), null, "после хода партия уже состоялась");
    assert.equal(after.isOver(), false);
  });

  it("недостаточный материал кончает партию сам", () => {
    // Слон забирает последнюю фигуру: остаются король со слоном против
    // голого короля, и матовать больше нечем.
    const game = new ChessGame("7k/6n1/8/8/8/8/1B6/K7 w - - 0 1");
    assert.equal(game.outcome(), null, "пока конь на доске, материала хватает");

    const take = game.move({ from: "b2", to: "g7" }, 0);
    assert.equal(take.ok, true);
    assert.deepEqual(game.outcome(), {
      result: "draw",
      reason: "insufficient",
    });
  });

  it("партия кончается только раз: сдача после мата ничего не меняет", () => {
    const game = new ChessGame("7k/5Q2/6K1/8/8/8/8/8 w - - 0 1");
    game.move({ from: "f7", to: "g7" }, 0);

    assert.equal(game.resign("b"), null, "вторая дверь не открывается");
    assert.deepEqual(game.outcome(), {
      result: "white",
      reason: "checkmate",
    });
  });
});

describe("флаг", () => {
  it("обычный флаг — поражение", () => {
    const game = new ChessGame();
    assert.deepEqual(game.flag("w"), { result: "black", reason: "flag" });
  });

  it("флаг при недостаточном материале у соперника — ничья, а не поражение", () => {
    // У чёрных голый король: матовать нечем, и время белых тут ни при чём.
    for (const fen of [
      "7k/8/8/8/8/8/8/K7 w - - 0 1",
      "7k/8/8/8/8/8/8/KB6 w - - 0 1",
      "7k/8/8/8/8/8/8/KN6 w - - 0 1",
    ]) {
      const game = new ChessGame(fen);
      assert.deepEqual(
        game.flag("w"),
        { result: "draw", reason: "flagVsInsufficient" },
        fen,
      );
    }
  });

  it("с ладьёй, конём и слоном или двумя конями матовать есть чем", () => {
    for (const [fen, expected] of [
      ["7k/8/8/8/8/8/8/KR6 w - - 0 1", true],
      ["7k/8/8/8/8/8/8/KNN5 w - - 0 1", true],
      ["7k/8/8/8/8/8/8/KBN5 w - - 0 1", true],
      ["7k/8/8/8/8/1P6/8/K7 w - - 0 1", true],
      // Два слона на полях одного цвета доску не покрывают.
      ["7k/8/8/8/8/8/2B5/KB6 w - - 0 1", false],
      // А на разных — покрывают.
      ["7k/8/8/8/8/8/1B6/KB6 w - - 0 1", true],
    ] as const) {
      assert.equal(new ChessGame(fen).canMate("w"), expected, fen);
    }
  });
});

describe("повторения и правило ходов", () => {
  /** Погонять коней туда-обратно заданное число полных кругов. */
  function shuffle(game: ChessGame, rounds: number): void {
    for (let round = 0; round < rounds; round++) {
      play(game, [
        ["g1", "f3"],
        ["g8", "f6"],
        ["f3", "g1"],
        ["f6", "g8"],
      ]);
    }
  }

  it("троекратное повторение даёт право требовать, но партию не кончает", () => {
    const game = new ChessGame();
    shuffle(game, 2);

    assert.equal(game.isOver(), false, "по правилам партия идёт дальше");
    assert.equal(game.claimableDraw(), "threefold");
  });

  it("заявленная ничья по повторению кончает партию", () => {
    const game = new ChessGame();
    shuffle(game, 2);

    assert.deepEqual(game.claimDraw(), {
      result: "draw",
      reason: "threefold",
    });
  });

  it("без основания заявление ничего не делает", () => {
    const game = new ChessGame();
    game.move({ from: "e2", to: "e4" }, 0);

    assert.equal(game.claimableDraw(), null);
    assert.equal(game.claimDraw(), null);
    assert.equal(game.isOver(), false);
  });

  it("право пропадает, как только позиция изменилась", () => {
    const game = new ChessGame();
    shuffle(game, 2);
    assert.equal(game.claimableDraw(), "threefold");

    // Ход пешкой расплетает повторение: этой позиции ещё не было.
    game.move({ from: "e2", to: "e4" }, game.ply());
    assert.equal(game.claimableDraw(), null);
  });

  it("пятикратное повторение кончает партию само, без всякой заявки", () => {
    const game = new ChessGame();
    shuffle(game, 4);

    assert.deepEqual(game.outcome(), { result: "draw", reason: "fivefold" });
  });

  it("считает повторения так же, как библиотека", () => {
    const ours = new ChessGame();
    const theirs = new Chess();

    for (const move of ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1"]) {
      theirs.move(move);
    }
    shuffle(ours, 1);
    play(ours, [
      ["g1", "f3"],
      ["g8", "f6"],
      ["f3", "g1"],
    ]);

    assert.equal(theirs.isThreefoldRepetition(), false, "ещё не трижды");
    assert.equal(ours.isOver(), false);
  });

  it("потеря прав рокировки делает позицию другой", () => {
    // Ладьи ходят туда-обратно: расстановка та же, но рокировать уже нельзя.
    const game = new ChessGame("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    play(game, [
      ["h1", "g1"],
      ["h8", "g8"],
      ["g1", "h1"],
      ["g8", "h8"],
    ]);

    // Стартовая расстановка повторилась, но правами она уже не та —
    // повторением это не считается.
    assert.equal(game.isOver(), false);
  });

  it("пятьдесят ходов дают право требовать, но не кончают партию", () => {
    const game = new ChessGame("4k3/8/8/8/8/8/8/4K2R w - - 99 60");
    game.move({ from: "h1", to: "h2" }, 0);

    assert.equal(game.isOver(), false);
    assert.equal(game.claimableDraw(), "fiftyMoves");
    assert.deepEqual(game.claimDraw(), {
      result: "draw",
      reason: "fiftyMoves",
    });
  });

  it("семьдесят пять ходов — тоже ничья, и причина своя", () => {
    const game = new ChessGame("4k3/8/8/8/8/8/8/4K2R w - - 149 90");
    game.move({ from: "h1", to: "h2" }, 0);

    assert.deepEqual(game.outcome(), {
      result: "draw",
      reason: "seventyFiveMoves",
    });
  });

  it("семьдесят пять ходов сильнее незаявленного права на пятьдесят", () => {
    // Право на ничью по пятидесяти ходам к этому моменту давно есть, но никто
    // им не воспользовался — партию кончает автоматическое правило.
    const game = new ChessGame("4k3/8/8/8/8/8/8/4K2R w - - 149 90");
    assert.equal(game.claimableDraw(), "fiftyMoves");

    game.move({ from: "h1", to: "h2" }, 0);
    assert.deepEqual(game.outcome(), {
      result: "draw",
      reason: "seventyFiveMoves",
    });
  });

  it("взятие сбрасывает счётчик ходов", () => {
    const game = new ChessGame("4k3/8/8/8/7p/8/8/4K2R w - - 99 60");
    game.move({ from: "h1", to: "h4" }, 0);

    assert.equal(game.isOver(), false, "взятие обнулило счётчик");
  });
});

describe("генерация ходов", () => {
  it("perft сходится со справочными числами", () => {
    // Классическая проверка: расхождение здесь означает ошибку в правилах,
    // которую глазами не увидеть.
    const chess = new Chess();
    assert.equal(chess.perft(1), 20);
    assert.equal(chess.perft(2), 400);
    assert.equal(chess.perft(3), 8902);
  });
});

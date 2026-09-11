import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromFen } from "./fen";
import { TurboGame } from "./game";
import { repetitionKey } from "./moves";

/**
 * Правила обычной партии через фасад — те же сценарии, что у шахмат
 * (src/games/chess/engine/rules.test.ts), плюс то, что там закрывала
 * библиотека, а здесь написано своими руками: взятие на проходе, рокировка
 * под боем, превращение.
 */

function game(fen?: string): TurboGame {
  return new TurboGame(fen ? fromFen(fen) : undefined);
}

/** Прогнать ходы, проверяя, что каждый принят. */
function play(target: TurboGame, moves: [string, string][]): void {
  for (const [from, to] of moves) {
    const result = target.move({ from, to }, target.ply());
    assert.equal(result.ok, true, `${from}${to} не принят`);
  }
}

describe("партия целиком", () => {
  it("играется от начала до мата", () => {
    const party = game();

    // Детский мат: 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#
    play(party, [
      ["e2", "e4"],
      ["e7", "e5"],
      ["f1", "c4"],
      ["b8", "c6"],
      ["d1", "h5"],
      ["g8", "f6"],
    ]);

    const mate = party.move({ from: "h5", to: "f7" }, party.ply());
    assert.equal(mate.ok, true);
    assert.equal(mate.ok && mate.move.san, "Qxf7#");
    assert.equal(mate.ok && mate.move.captured, "p");
    assert.deepEqual(party.outcome(), { result: 0, reason: "checkmate" });
    assert.equal(party.ply(), 7);
    assert.deepEqual(party.history().slice(0, 3), ["e4", "e5", "Bc4"]);
    assert.deepEqual(party.lastMove(), { from: "h5", to: "f7" });
  });

  it("после конца партии ходов не принимает", () => {
    const party = game("7k/5Q2/6K1/8/8/8/8/8 w - - 0 1");
    party.move({ from: "f7", to: "g7" }, 0);

    assert.equal(party.outcome()?.reason, "checkmate");
    assert.deepEqual(party.move({ from: "g6", to: "f6" }, party.ply()), {
      ok: false,
      reason: "gameOver",
    });
  });

  it("в начале у белых двадцать ходов", () => {
    assert.equal(game().legal().length, 20);
  });
});

describe("приём хода", () => {
  it("отбивает нелегальный ход отказом, а не падением", () => {
    assert.deepEqual(game().move({ from: "e2", to: "e5" }, 0), {
      ok: false,
      reason: "illegal",
    });
  });

  it("не даёт ходить чужой фигурой", () => {
    assert.deepEqual(game().move({ from: "e7", to: "e5" }, 0), {
      ok: false,
      reason: "illegal",
    });
  });

  it("кривые клетки от клиента — отказ", () => {
    for (const [from, to] of [
      ["z9", "e4"],
      ["e2", ""],
      ["e2", "e44"],
    ] as const) {
      assert.deepEqual(game().move({ from, to }, 0), {
        ok: false,
        reason: "illegal",
      });
    }
  });

  it("отбрасывает ход с чужим номером полухода", () => {
    const party = game();
    assert.deepEqual(party.move({ from: "e2", to: "e4" }, 1), {
      ok: false,
      reason: "stalePly",
    });

    play(party, [["e2", "e4"]]);
    // Повтор того же хода с тем же номером — это двойной клик, а не ход.
    assert.deepEqual(party.move({ from: "e7", to: "e5" }, 0), {
      ok: false,
      reason: "stalePly",
    });
  });

  it("превращение без фигуры — отказ, с фигурой — ход", () => {
    const party = game("7k/P7/8/8/8/8/8/K7 w - - 0 1");
    assert.deepEqual(party.move({ from: "a7", to: "a8" }, 0), {
      ok: false,
      reason: "needsPromotion",
    });

    const made = party.move({ from: "a7", to: "a8", promotion: "n" }, 0);
    assert.equal(made.ok && made.move.san, "a8=N");
    assert.deepEqual(party.pieceAt("a8"), { kind: "n", side: 0 });
  });

  it("лишняя фигура превращения при обычном ходе не мешает", () => {
    const made = game().move({ from: "e2", to: "e4", promotion: "q" }, 0);
    assert.equal(made.ok && made.move.san, "e4");
  });

  it("рокировка принимается и королём на две клетки, и королём на ладью", () => {
    const fen = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";

    for (const to of ["g1", "h1"]) {
      const party = game(fen);
      const made = party.move({ from: "e1", to }, 0);
      assert.equal(made.ok && made.move.san, "O-O", to);
      assert.deepEqual(party.pieceAt("g1"), { kind: "k", side: 0 });
      assert.deepEqual(party.pieceAt("f1"), { kind: "r", side: 0 });
      assert.equal(party.pieceAt("h1"), null);
    }

    const long = game(fen);
    const made = long.move({ from: "e1", to: "a1" }, 0);
    assert.equal(made.ok && made.move.san, "O-O-O");
    assert.deepEqual(long.pieceAt("c1"), { kind: "k", side: 0 });
    assert.deepEqual(long.pieceAt("d1"), { kind: "r", side: 0 });
  });
});

describe("рокировка", () => {
  it("нельзя через битое поле, а в другую сторону можно", () => {
    // Чёрная ладья на f2 бьёт f1, по которому пройдёт король.
    const fen = "r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1";
    assert.equal(game(fen).move({ from: "e1", to: "g1" }, 0).ok, false);
    assert.equal(game(fen).move({ from: "e1", to: "c1" }, 0).ok, true);
  });

  it("длинная разрешена, даже если бьют b1: король там не проходит", () => {
    const fen = "r3k2r/8/8/8/8/8/1r6/R3K2R w KQkq - 0 1";
    // Ладья на b2 бьёт b1 — длинной рокировке это не мешает.
    assert.equal(game(fen).move({ from: "e1", to: "c1" }, 0).ok, true);
  });

  it("нельзя из-под шаха", () => {
    const fen = "r3k2r/8/8/8/8/8/8/R3K1r1 w Qkq - 0 1";
    assert.equal(game(fen).move({ from: "e1", to: "c1" }, 0).ok, false);
  });

  it("права сгорают: король сходил — обе, ладья ушла или взята — одна", () => {
    const party = game("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    play(party, [["a1", "a8"]]);
    // Белая ладья ушла с a1 и забрала чёрную на a8: у белых нет длинной, у
    // чёрных — длинной.
    const rights = party
      .position()
      .castling.map((right) => `${right.side}:${right.rook}`);
    assert.deepEqual(rights.sort(), ["0:7", "1:63"]);

    play(party, [["e8", "d7"]]);
    assert.deepEqual(
      party.position().castling.map((right) => right.side),
      [0],
      "король чёрных сходил — их прав больше нет",
    );
  });
});

describe("взятие на проходе", () => {
  it("можно сразу после хода на два поля, забирает пешку сбоку", () => {
    const party = game();
    play(party, [
      ["e2", "e4"],
      ["a7", "a6"],
      ["e4", "e5"],
      ["d7", "d5"],
    ]);

    const made = party.move({ from: "e5", to: "d6" }, party.ply());
    assert.equal(made.ok && made.move.san, "exd6");
    assert.equal(made.ok && made.move.captured, "p");
    assert.equal(party.pieceAt("d5"), null);
  });

  it("через ход — уже нельзя", () => {
    const party = game();
    play(party, [
      ["e2", "e4"],
      ["a7", "a6"],
      ["e4", "e5"],
      ["d7", "d5"],
      ["a2", "a3"],
      ["a6", "a5"],
    ]);

    assert.equal(party.move({ from: "e5", to: "d6" }, party.ply()).ok, false);
  });

  it("нельзя, если после взятия горизонталь вскрывается на своего короля", () => {
    // Обе пешки уходят с пятой горизонтали, и ладья h5 бьёт короля на a5.
    const party = game("8/8/8/K2pP2r/8/8/8/7k w - d6 0 1");
    assert.equal(party.move({ from: "e5", to: "d6" }, 0).ok, false);
  });
});

describe("окончания партии", () => {
  it("пат — ничья", () => {
    const party = game("k7/8/2Q5/8/8/8/8/7K w - - 0 1");
    party.move({ from: "c6", to: "b6" }, 0);

    assert.deepEqual(party.outcome(), { result: "draw", reason: "stalemate" });
  });

  it("сдача отдаёт партию сопернику", () => {
    assert.deepEqual(game().resign(0), { result: 1, reason: "resign" });
  });

  it("ничья по соглашению", () => {
    assert.deepEqual(game().agreeDraw(), {
      result: "draw",
      reason: "agreement",
    });
  });

  it("брошенная партия достаётся сопернику", () => {
    assert.deepEqual(game().abandon(1), { result: 0, reason: "abandoned" });
  });

  it("отменить можно только до первого хода", () => {
    assert.deepEqual(game().abort(), { result: "draw", reason: "aborted" });

    const started = game();
    play(started, [["e2", "e4"]]);
    assert.equal(started.abort(), null);
    assert.equal(started.isOver(), false);
  });

  it("недостаточный материал кончает партию сам", () => {
    const party = game("7k/8/8/8/8/8/5n2/4K3 w - - 0 1");
    party.move({ from: "e1", to: "f2" }, 0);

    assert.deepEqual(party.outcome(), {
      result: "draw",
      reason: "insufficient",
    });
  });

  it("партия кончается только раз: сдача после мата ничего не меняет", () => {
    const party = game("7k/5Q2/6K1/8/8/8/8/8 w - - 0 1");
    party.move({ from: "f7", to: "g7" }, 0);

    assert.equal(party.resign(0), null);
    assert.deepEqual(party.outcome(), { result: 0, reason: "checkmate" });
  });
});

describe("флаг", () => {
  it("обычный флаг — поражение", () => {
    assert.deepEqual(game().flag(0), { result: 1, reason: "flag" });
  });

  it("флаг при недостаточном материале у соперника — ничья, а не поражение", () => {
    for (const fen of [
      "7k/8/8/8/8/8/8/K7 w - - 0 1",
      "7k/8/8/8/8/8/8/KB6 w - - 0 1",
      "7k/8/8/8/8/8/8/KN6 w - - 0 1",
    ]) {
      // Флаг упал у чёрных, а у белых матовать нечем.
      assert.deepEqual(
        game(fen).flag(1),
        { result: "draw", reason: "flagVsInsufficient" },
        fen,
      );
    }
  });

  it("с ладьёй, пешкой, конём и слоном или двумя конями матовать есть чем", () => {
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
      assert.equal(game(fen).canMate(0), expected, fen);
    }
  });
});

describe("повторения и правило ходов", () => {
  /** Погонять коней туда-обратно заданное число полных кругов. */
  function shuffle(party: TurboGame, rounds: number): void {
    for (let round = 0; round < rounds; round++) {
      play(party, [
        ["g1", "f3"],
        ["g8", "f6"],
        ["f3", "g1"],
        ["f6", "g8"],
      ]);
    }
  }

  it("троекратное повторение даёт право требовать, но партию не кончает", () => {
    const party = game();
    shuffle(party, 2);

    assert.equal(party.isOver(), false, "по правилам партия идёт дальше");
    assert.equal(party.claimableDraw(), "threefold");
    assert.deepEqual(party.claimDraw(), {
      result: "draw",
      reason: "threefold",
    });
  });

  it("без основания заявление ничего не делает", () => {
    const party = game();
    play(party, [["e2", "e4"]]);

    assert.equal(party.claimableDraw(), null);
    assert.equal(party.claimDraw(), null);
    assert.equal(party.isOver(), false);
  });

  it("право пропадает, как только позиция изменилась", () => {
    const party = game();
    shuffle(party, 2);
    play(party, [["e2", "e4"]]);

    assert.equal(party.claimableDraw(), null);
  });

  it("пятикратное повторение кончает партию само, без всякой заявки", () => {
    const party = game();
    shuffle(party, 4);

    assert.deepEqual(party.outcome(), { result: "draw", reason: "fivefold" });
  });

  it("потеря прав рокировки делает позицию другой", () => {
    const party = game("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    for (let round = 0; round < 2; round++) {
      play(party, [
        ["h1", "g1"],
        ["h8", "g8"],
        ["g1", "h1"],
        ["g8", "h8"],
      ]);
    }

    // Расстановка стартовая в третий раз, но правами первая была другой.
    assert.equal(party.claimableDraw(), null);
  });

  it("поле взятия на проходе меняет позицию, только если взять и правда можно", () => {
    const quiet = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq";
    assert.equal(
      repetitionKey(fromFen(`${quiet} e3 0 1`)),
      repetitionKey(fromFen(`${quiet} - 0 1`)),
      "мимо пустоты: позиция та же",
    );

    const loaded = "rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq";
    assert.notEqual(
      repetitionKey(fromFen(`${loaded} e3 0 1`)),
      repetitionKey(fromFen(`${loaded} - 0 1`)),
      "пешка d4 может взять — позиция другая",
    );
  });

  it("пятьдесят ходов дают право требовать, но не кончают партию", () => {
    const party = game("4k3/8/8/8/8/8/8/4K2R w - - 99 60");
    play(party, [["h1", "h2"]]);

    assert.equal(party.isOver(), false);
    assert.equal(party.claimableDraw(), "fiftyMoves");
  });

  it("семьдесят пять ходов кончают партию сами — сильнее незаявленного права", () => {
    const party = game("4k3/8/8/8/8/8/8/4K2R w - - 149 90");
    assert.equal(party.claimableDraw(), "fiftyMoves");

    play(party, [["h1", "h2"]]);
    assert.deepEqual(party.outcome(), {
      result: "draw",
      reason: "seventyFiveMoves",
    });
  });

  it("взятие сбрасывает счётчик ходов", () => {
    const party = game("4k3/8/8/8/7p/8/8/4K2R w - - 99 60");
    play(party, [["h1", "h4"]]);

    assert.equal(party.claimableDraw(), null);
    assert.equal(party.position().quiet, 0);
  });
});

describe("взятое", () => {
  it("каждая сторона помнит, что забрала", () => {
    const party = game();
    play(party, [
      ["e2", "e4"],
      ["d7", "d5"],
      ["e4", "d5"],
      ["d8", "d5"],
    ]);

    const [white, black] = party.position().taken;
    assert.deepEqual(white, [{ kind: "p", side: 1 }]);
    assert.deepEqual(black, [{ kind: "p", side: 0 }]);
  });
});

describe("ход назад", () => {
  it("возвращает позицию, очередь и последний ход", () => {
    const party = game();
    play(party, [
      ["e2", "e4"],
      ["e7", "e5"],
    ]);

    assert.equal(party.undo(), true);
    assert.equal(party.ply(), 1);
    assert.equal(party.turn(), 1);
    assert.equal(party.pieceAt("e5"), null);
    assert.deepEqual(party.pieceAt("e7"), { kind: "p", side: 1 });
    assert.deepEqual(party.lastMove(), { from: "e2", to: "e4" });
  });

  it("забывает позицию, которой больше нет", () => {
    const party = game();
    for (let round = 0; round < 2; round++) {
      play(party, [
        ["g1", "f3"],
        ["g8", "f6"],
        ["f3", "g1"],
        ["f6", "g8"],
      ]);
    }
    assert.equal(party.claimableDraw(), "threefold");

    party.undo();
    party.undo();
    party.undo();
    party.undo();
    play(party, [
      ["g1", "f3"],
      ["g8", "f6"],
      ["f3", "g1"],
      ["f6", "g8"],
    ]);
    // Отмотанное не считается: стартовая позиция снова встречалась дважды.
    assert.equal(party.claimableDraw(), "threefold");
    party.undo();
    assert.equal(party.claimableDraw(), null);
  });

  it("до первого хода отматывать нечего", () => {
    assert.equal(game().undo(), false);
  });

  it("кончившуюся партию не воскрешает", () => {
    const party = game("7k/5Q2/6K1/8/8/8/8/8 w - - 0 1");
    party.move({ from: "f7", to: "g7" }, 0);

    assert.equal(party.undo(), false);
    assert.equal(party.outcome()?.reason, "checkmate");
  });
});

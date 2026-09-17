import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromFen } from "../engine/fen";
import { parseSquare, squareName } from "../engine/geometry";
import { TurboGame } from "../engine/game";
import { inCheck, legalMoves } from "../engine/moves";
import type { Piece, Side } from "../engine/pieces";
import type { Effect, Position } from "../engine/position";
import {
  BINGE_EVENTS,
  BINGE_RANKS,
  THIRST_MS,
  bingeLeft,
  bingePosition,
  bingeRank,
  bingeRules,
  blinded,
  drawBinge,
  effectLeft,
  freshDecks,
  shaking,
  thirstCut,
  type BingeDecks,
  type BingeTable,
} from "./binge";
import { roller } from "./random";

/**
 * «Загул»: колоды, розыгрыш и сами события.
 *
 * Карту тянет тот, кто срубил, — то есть позиция здесь всегда «ход уже
 * сделан, очередь у соперника». Поэтому в позициях проверок ходят чёрные, а
 * карту тянут белые.
 */

/** Броски по списку; кончился — дальше идёт последний. */
function rolls(list: readonly number[]): () => number {
  let at = 0;
  return () => list[Math.min(at++, list.length - 1)] ?? 0;
}

/** Колода из одной карты: так проверяется именно она, а не везение. */
function only(id: string): BingeDecks {
  const rank = BINGE_EVENTS.find((event) => event.id === id)?.rank;
  assert.ok(rank, `нет такого события: ${id}`);

  const decks = freshDecks();
  for (const each of BINGE_RANKS) decks[each] = [];
  decks[rank] = [id];

  return decks;
}

/** Сыграть событие в этой позиции; `null` — мимо. */
function deal(
  fen: string,
  id: string,
  roll: () => number = rolls([0.5]),
  side: Side = 0,
  table: BingeTable = { enemyMoved: null, timed: true },
): Position | null {
  const rank = BINGE_EVENTS.find((event) => event.id === id)?.rank;
  assert.ok(rank);

  const drawn = drawBinge(only(id), rank, fromFen(fen), side, roll, table);
  assert.ok(drawn, "карта не вытянулась");
  assert.equal(drawn.event.id, id);

  return drawn.position;
}

/** Позиция с уже согнутым правилом: так проверяется движок, а не карта. */
function bentPosition(fen: string, ...effects: Effect[]): Position {
  return { ...fromFen(fen), effects };
}

/** Куда фигура с этой клетки может пойти — записями клеток. */
function targets(position: Position, from: string): string[] {
  const square = parseSquare(position.geometry, from);

  return legalMoves(position)
    .filter((move) => move.from === square)
    .map((move) => squareName(position.geometry, move.to))
    .sort();
}

/** Что стоит на клетке. */
function at(position: Position, square: string): Piece | null {
  const index = parseSquare(position.geometry, square);
  return index === null ? null : (position.board[index] ?? null);
}

/** Сколько фигур этой стороны на доске. */
function count(position: Position, side: Side): number {
  return position.board.filter((cell) => cell?.side === side).length;
}

describe("загул: колоды", () => {
  it("за короля не тянут, остальные ранги разведены", () => {
    assert.equal(bingeRank("p"), "pawn");
    assert.equal(bingeRank("n"), "minor");
    assert.equal(bingeRank("b"), "minor");
    assert.equal(bingeRank("r"), "rook");
    assert.equal(bingeRank("q"), "queen");
    assert.equal(bingeRank("k"), null);
  });

  it("свежие колоды считаются по рангам", () => {
    const decks = freshDecks();
    const left = bingeLeft(decks);

    assert.equal(
      left.pawn + left.minor + left.rook + left.queen,
      BINGE_EVENTS.length,
    );
    for (const rank of BINGE_RANKS) {
      assert.equal(
        left[rank],
        BINGE_EVENTS.filter((event) => event.rank === rank).length,
        rank,
      );
    }
  });

  it("сыгравшая карта выбывает, пустая колода событий не даёт", () => {
    const decks = only("spree");
    const position = fromFen("4k3/8/8/8/8/8/8/4K3 b");

    const first = drawBinge(decks, "rook", position, 0, rolls([0.5]));
    assert.equal(first?.event.id, "spree");
    assert.equal(bingeLeft(decks).rook, 0, "карта выбыла до конца партии");

    assert.equal(
      drawBinge(decks, "rook", position, 0, rolls([0.5])),
      null,
      "из пустой колоды не тянут",
    );
  });

  it("одно зерно — одна и та же карта и тот же её бросок", () => {
    const fen = "4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3 b";
    const one = drawBinge(freshDecks(), "rook", fromFen(fen), 0, roller(7, 1));
    const other = drawBinge(
      freshDecks(),
      "rook",
      fromFen(fen),
      0,
      roller(7, 1),
    );

    assert.equal(one?.event.id, other?.event.id);
    assert.deepEqual(one?.position?.board, other?.position?.board);
  });

  it("правила режима рассказывают про колоды и «мимо»", () => {
    const lines = bingeRules().join(" ");

    assert.match(lines, /колод/i);
    assert.match(lines, /мимо/i);
    assert.deepEqual(
      bingePosition().extra,
      [0, 0],
      "банк лишних ходов заведён",
    );
  });
});

describe("загул: лишние ходы", () => {
  it("«Второе дыхание» возвращает очередь тянувшему", () => {
    const after = deal("4k3/8/8/8/8/8/8/4K3 b", "secondWind");

    assert.equal(after?.turn, 0);
    assert.deepEqual(after?.extra, [0, 0], "банк при этом не растёт");
  });

  it("«Разгуляй» даёт два хода подряд: очередь и один в банке", () => {
    const after = deal("4k3/8/8/8/8/8/8/4K3 b", "spree");

    assert.equal(after?.turn, 0);
    assert.equal(after?.extra[0], 1);
    assert.equal(after?.extra[1], 0, "сопернику не достаётся");
  });
});

describe("загул: события по доске", () => {
  it("«Погром» снимает чужую фигуру, но не короля", () => {
    const after = deal("4k3/5ppp/8/8/8/8/8/4K3 b", "pogrom");

    assert.ok(after);
    assert.equal(count(after, 1), 3, "была четвёрка с королём");
    assert.ok(at(after, "e8"), "король на месте");
  });

  it("«Погром» по голому королю — мимо", () => {
    assert.equal(deal("4k3/8/8/8/8/8/8/4K3 b", "pogrom"), null);
  });

  it("«Двоится» ставит лишнюю пешку на своей половине", () => {
    const after = deal("4k3/8/8/8/8/8/8/4K3 b", "double");
    assert.ok(after);

    const added = after.board.flatMap((cell, square) =>
      cell?.kind === "p" && cell.side === 0 ? [square] : [],
    );
    assert.equal(added.length, 1);

    const rank = Math.floor((added[0] ?? 0) / 8);
    assert.ok(
      rank >= 1 && rank <= 3,
      `пешка встала на ${rank + 1} горизонталь`,
    );
  });

  it("«Обнос» выжигает угол, а короля огонь не берёт", () => {
    // Первый бросок выбирает угол: ноль — левый нижний.
    const after = deal("4k3/8/8/8/8/8/1P6/R3K3 b", "heist", rolls([0]));

    assert.ok(after);
    assert.equal(at(after, "a1"), null, "ладья сгорела");
    assert.equal(at(after, "b2"), null, "пешка сгорела");
    assert.ok(at(after, "e1"), "король стоит");
  });

  it("«Смена караула» меняет чужих короля и ладью и гасит рокировку", () => {
    const after = deal("r3k3/8/8/8/8/8/8/6K1 b q -", "guard");

    assert.equal(at(after!, "a8")?.kind, "k");
    assert.equal(at(after!, "e8")?.kind, "r");
    assert.equal(
      after?.castling.filter((right) => right.side === 1).length,
      0,
      "рокировки у чёрных больше нет",
    );
  });

  it("«Танцпол» чистит вертикаль от пешек обеих сторон", () => {
    const after = deal("4k3/3p4/8/8/8/8/3P4/4K3 b", "floor");

    assert.equal(at(after!, "d7"), null);
    assert.equal(at(after!, "d2"), null);
  });

  it("«Карусель» меняет коней и слонов местами по виду", () => {
    const after = deal("4k3/8/8/8/8/8/8/2B1K1N1 b", "carousel");

    assert.equal(at(after!, "c1")?.kind, "n");
    assert.equal(at(after!, "g1")?.kind, "b");
  });

  it("«Стенка на стенку» двигает пешки обеих сторон", () => {
    const after = deal("4k3/3p4/8/8/8/8/3P4/4K3 b", "wall");

    assert.equal(at(after!, "d3")?.side, 0);
    assert.equal(at(after!, "d6")?.side, 1);
  });

  it("«Круговая порука» двигает своих, но король остаётся", () => {
    const after = deal("4k3/8/8/8/8/8/8/R3K3 b", "solidarity");

    assert.equal(at(after!, "a2")?.kind, "r");
    assert.equal(at(after!, "e1")?.kind, "k", "король в шеренгу не встаёт");
  });

  it("«Всё пропил» снимает половину у обоих, короли остаются", () => {
    const after = deal("4k3/pppp4/8/8/8/8/PPPP4/4K3 b", "spent");
    assert.ok(after);

    assert.equal(count(after, 0), 3, "две пешки из четырёх и король");
    assert.equal(count(after, 1), 3);
    assert.ok(at(after, "e1") && at(after, "e8"));
  });

  it("«Дебош» двигает чужую фигуру, а не свою", () => {
    const after = deal("4k3/8/8/8/8/5n2/8/4K3 b", "brawl");
    assert.ok(after);

    assert.equal(at(after, "f3"), null, "конь соперника ушёл");
    assert.equal(count(after, 1), 2, "но никуда не делся");
    assert.equal(count(after, 0), 1);
  });

  it("«Не помню как тут оказался» уносит свою фигуру, кроме короля", () => {
    const after = deal("4k3/8/8/8/8/8/8/R3K3 b", "lost");
    assert.ok(after);

    assert.equal(at(after, "a1"), null);
    assert.equal(at(after, "e1")?.kind, "k");
    assert.equal(count(after, 0), 2);
  });

  it("«Обознался» переставляет свои пешки — и в этом вся шутка", () => {
    const before = fromFen("4k3/8/8/8/8/8/PP6/4K3 b");
    const after = deal("4k3/8/8/8/8/8/PP6/4K3 b", "mistaken");
    assert.ok(after);

    assert.deepEqual(
      after.board.map((cell) => (cell ? `${cell.kind}${cell.side}` : null)),
      before.board.map((cell) => (cell ? `${cell.kind}${cell.side}` : null)),
      "пешки неразличимы, поэтому доска та же",
    );
  });
});

describe("загул: мимо", () => {
  it("событие не подставляет своего короля под бой", () => {
    // Ладья e2 закрывает короля от чёрной ладьи: унести её — отдать партию.
    assert.equal(deal("4r2k/8/8/8/8/8/4R3/4K3 b", "lost"), null);
  });

  it("событию, которому некуда играть, засчитывается мимо", () => {
    // Свободных клеток на своей половине нет — лишней пешке встать негде.
    assert.equal(
      deal("4k3/8/8/8/PPPPPPPP/PPPPPPPP/PPPPPPPP/RNBQKBNR b", "double"),
      null,
    );
  });
});

describe("загул: согнутые правила", () => {
  it("«Разгон» гонит пешку на три клетки и тает за два полухода", () => {
    const rush = bentPosition("4k3/8/8/8/8/8/4P3/4K3 w", {
      kind: "rush",
      side: null,
      left: 2,
    });
    assert.deepEqual(targets(rush, "e2"), ["e3", "e4", "e5"]);

    const game = new TurboGame(rush);
    assert.equal(game.move({ from: "e2", to: "e5" }, 0).ok, true);
    assert.equal(game.position().effects[0]?.left, 1, "остался один полуход");
    assert.equal(
      game.position().enPassant,
      null,
      "разогнавшуюся мимоходом не бьют",
    );

    assert.equal(game.move({ from: "e8", to: "e7" }, 1).ok, true);
    assert.deepEqual(game.position().effects, [], "разгон кончился");
  });

  it("«Похмелье» велит ходить той же фигурой, но без ходов не оставляет", () => {
    const square = parseSquare(
      fromFen("4k3/8/5n2/8/8/8/8/4K3 b").geometry,
      "f6",
    );
    assert.ok(square !== null);

    const stuck = bentPosition("4k3/8/5n2/8/8/8/8/4K3 b", {
      kind: "hangover",
      side: 1,
      left: 1,
      square,
    });
    assert.ok(
      legalMoves(stuck).every((move) => move.from === square),
      "ходит только конь",
    );

    // Той фигуры уже нет — правило молчит, иначе ходить было бы нечем.
    const gone = bentPosition("4k3/8/8/8/8/8/8/4K3 b", {
      kind: "hangover",
      side: 1,
      left: 1,
      square,
    });
    assert.ok(legalMoves(gone).length > 0);
  });

  it("«Похмелье» на срубленную фигуру — мимо", () => {
    const board = fromFen("4k3/8/8/8/8/8/8/4K3 b");
    const empty = parseSquare(board.geometry, "d5");
    assert.ok(empty !== null);

    assert.equal(
      deal("4k3/8/8/8/8/8/8/4K3 b", "hangover", rolls([0.5]), 0, {
        enemyMoved: empty,
        timed: true,
      }),
      null,
    );
  });

  it("«Заплетается» пускает пешку вбок, но не на занятую клетку", () => {
    const drunk = bentPosition("4k3/8/8/8/3PP1P1/8/8/4K3 w", {
      kind: "stagger",
      side: null,
      left: 2,
    });

    assert.deepEqual(targets(drunk, "e4"), ["e5", "f4"], "d4 занята своей");
    assert.deepEqual(targets(drunk, "g4"), ["f4", "g5", "h4"]);
  });

  it("«Занос» водит коня по диагонали — и шах от этого настоящий", () => {
    const skid = bentPosition("4k3/8/8/8/8/2n5/8/4K3 b", {
      kind: "skid",
      side: null,
      left: 1,
    });

    assert.ok(targets(skid, "c3").includes("a1"), "конь пошёл слоном");
    assert.equal(inCheck(skid, 0), true, "и достал короля на e1");
  });

  it("«Кабак закрыт» гасит рокировку и взятие на проходе", () => {
    const closed: Effect = { kind: "closed", side: null, left: 2 };

    const castle = bentPosition("4k3/8/8/8/8/8/8/R3K2R w KQ -", closed);
    assert.deepEqual(targets(castle, "e1"), ["d1", "d2", "e2", "f1", "f2"]);

    const passant = bentPosition("4k3/8/8/3pP3/8/8/8/4K3 w - d6", closed);
    assert.deepEqual(targets(passant, "e5"), ["e6"], "на проходе не бьют");
  });

  it("«Кураж» отдаёт лишний ход за взятие и на нём сгорает", () => {
    const swagger: Effect = { kind: "swagger", side: 0, left: 1 };
    const fen = "4k3/8/8/3p4/4P3/8/8/R3K3 w";

    const quiet = new TurboGame(bentPosition(fen, swagger));
    assert.equal(quiet.move({ from: "e4", to: "e5" }, 0).ok, true);
    assert.equal(quiet.turn(), 1, "без взятия кураж не тратится");
    assert.equal(quiet.position().effects.length, 1);

    const game = new TurboGame(bentPosition(fen, swagger));
    assert.equal(
      game.move({ from: "e4", to: "d5" }, 0).ok,
      true,
      "белые берут",
    );
    assert.equal(game.turn(), 0, "и ходят ещё раз");
    assert.deepEqual(game.position().effects, [], "кураж сгорел");
  });

  it("направленный эффект считает только ходы своей стороны", () => {
    // Ладья на доске нужна, чтобы партия не кончилась ничьей по материалу.
    const game = new TurboGame(
      bentPosition("4k3/8/8/8/8/8/8/R3K3 w", {
        kind: "blind",
        side: 1,
        left: 1,
      }),
    );

    assert.equal(game.move({ from: "e1", to: "e2" }, 0).ok, true);
    assert.equal(
      blinded(game.position(), 1),
      true,
      "чужой ход слепоту не тратит",
    );

    assert.equal(game.move({ from: "e8", to: "e7" }, 1).ok, true);
    assert.equal(blinded(game.position(), 1), false);
  });

  it("«Тремор» крутит доску обоим, «Слепота» — только сопернику", () => {
    const shake = deal("4k3/8/8/8/8/8/8/4K3 b", "tremor");
    assert.equal(shaking(shake!), true);
    assert.equal(shake?.effects[0]?.side, null, "обоим");

    const dark = deal("4k3/8/8/8/8/8/8/4K3 b", "blind");
    assert.equal(blinded(dark!, 1), true);
    assert.equal(blinded(dark!, 0), false, "тянувшему видно");
  });

  it("«Сушняк» режет время, а без часов сгорает впустую", () => {
    const dry = deal("4k3/8/8/8/8/8/8/4K3 b", "thirst");
    assert.ok(dry);
    assert.equal(thirstCut(dry, 1, 60_000), THIRST_MS, "минус тридцать секунд");
    assert.equal(
      thirstCut(dry, 1, 10_000),
      5_000,
      "но не больше половины лимита",
    );
    assert.equal(thirstCut(dry, 0, 60_000), 0, "тянувшего это не касается");
    assert.equal(
      thirstCut(dry, 1, null),
      0,
      "в безлимитной комнате резать нечего",
    );

    assert.equal(
      deal("4k3/8/8/8/8/8/8/4K3 b", "thirst", rolls([0.5]), 0, {
        enemyMoved: null,
        timed: false,
      }),
      null,
    );
  });

  it("счётчик эффекта читается человеческим текстом", () => {
    assert.equal(
      effectLeft({ kind: "rush", side: null, left: 2 }),
      "ещё 2 хода",
    );
    assert.equal(effectLeft({ kind: "blind", side: 1, left: 1 }), "ещё ход");
    assert.equal(
      effectLeft({ kind: "swagger", side: 0, left: 1 }),
      "до взятия",
    );
  });
});

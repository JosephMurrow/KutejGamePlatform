import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromFen } from "../engine/fen";
import { parseSquare } from "../engine/geometry";
import type { Piece, Side } from "../engine/pieces";
import type { Position } from "../engine/position";
import {
  BINGE_EVENTS,
  BINGE_RANKS,
  bingeLeft,
  bingePosition,
  bingeRank,
  bingeRules,
  drawBinge,
  freshDecks,
  type BingeDecks,
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
): Position | null {
  const rank = BINGE_EVENTS.find((event) => event.id === id)?.rank;
  assert.ok(rank);

  const drawn = drawBinge(only(id), rank, fromFen(fen), side, roll);
  assert.ok(drawn, "карта не вытянулась");
  assert.equal(drawn.event.id, id);

  return drawn.position;
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

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BLUNDER_DRIFT,
  GOOD_DRIFT,
  materialEdge,
  piecesLeft,
  Watcher,
  type Facts,
} from "./watch";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
/** Ладейное окончание: по фигуре у каждого. */
const ROOKS = "8/5pk1/8/8/8/8/5PK1/R6r w - - 0 40";
/** У белых лишний ферзь. */
const EXTRA = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1";

const facts = (extra: Partial<Facts> = {}): Facts => ({
  ply: 20,
  fen: START,
  white: true,
  inBook: false,
  drift: null,
  ...extra,
});

describe("что бот видит сам", () => {
  it("считает материал со своей стороны", () => {
    assert.equal(materialEdge(START, true), 0);
    assert.equal(materialEdge(EXTRA, true), -9, "ферзя нет у белых");
    assert.equal(materialEdge(EXTRA, false), 9, "и это перевес чёрных");
  });

  it("считает фигуры без королей и пешек", () => {
    assert.equal(piecesLeft(START), 14);
    assert.equal(piecesLeft(ROOKS), 2);
  });

  it("зевок соперника узнаёт по скачку оценки", () => {
    assert.equal(
      new Watcher().before(facts({ drift: BLUNDER_DRIFT })),
      "playerBlunder",
    );
    assert.equal(
      new Watcher().before(facts({ drift: -GOOD_DRIFT })),
      "playerGoodMove",
    );
    assert.notEqual(
      new Watcher().before(facts({ drift: 20 })),
      "playerBlunder",
      "полпешки туда-сюда — обычная игра",
    );
  });

  it("состояние объявляет один раз за партию", () => {
    const watcher = new Watcher();
    // Книга ещё ведёт, а ход двадцатый: ни про дебют, ни про выход из книги
    // сказать нечего — остаётся только эндшпиль.
    const late = { fen: ROOKS, inBook: true };

    assert.equal(watcher.before(facts(late)), "endgame");
    watcher.spoke("endgame");
    assert.equal(
      watcher.before(facts(late)),
      null,
      "второй раз про эндшпиль молчит",
    );
  });

  it("несказанное не считается сказанным", () => {
    const watcher = new Watcher();
    const late = { fen: ROOKS, inBook: true };

    // Реплику проглотила пауза — про эндшпиль напомним ещё раз.
    assert.equal(watcher.before(facts(late)), "endgame");
    assert.equal(watcher.before(facts(late)), "endgame");
  });

  it("перелом замечает в обе стороны", () => {
    const watcher = new Watcher();
    const ahead = { fen: EXTRA, white: false, inBook: true };

    assert.equal(watcher.before(facts(ahead)), "winning");
    watcher.spoke("winning");
    assert.equal(
      watcher.before(facts(ahead)),
      null,
      "перевес объявляется однажды, а не каждый ход",
    );

    const losing = new Watcher();
    assert.equal(
      losing.before(facts({ fen: EXTRA, white: true, inBook: true })),
      "losing",
    );
  });

  it("реванш возвращает всё к началу", () => {
    const watcher = new Watcher();

    assert.equal(
      watcher.before(facts({ fen: ROOKS, inBook: true })),
      "endgame",
    );
    watcher.reset();
    assert.equal(
      watcher.before(facts({ fen: ROOKS, inBook: true })),
      "endgame",
      "новая партия — новые наблюдения",
    );
  });

  it("дебют и выход из книги — разные вещи", () => {
    assert.equal(
      new Watcher().before(facts({ ply: 4, inBook: true })),
      "opening",
    );
    assert.equal(
      new Watcher().before(facts({ ply: 12, inBook: false })),
      "outOfBook",
    );
    assert.equal(
      new Watcher().before(facts({ ply: 0, inBook: false })),
      null,
      "на первом ходу книга ещё не кончилась — она не начиналась",
    );
  });

  it("затянувшуюся партию замечает", () => {
    assert.equal(
      new Watcher().before(facts({ ply: 120, inBook: true })),
      "longGame",
    );
  });
});

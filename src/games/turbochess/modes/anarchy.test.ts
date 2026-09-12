import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TurboGame } from "../engine/game";
import { VETOES, anarchyPosition, anarchyRules } from "./anarchy";

/**
 * «Анархия»: большая красная кнопка «НЕТ». Проверяем счётчик, запрет на
 * повтор отменённого хода и то, ради чего кнопка и нужна, — что мат не
 * кончает партию, пока есть чем сказать нет.
 */

/** Детский мат: после него у белых мат, но «НЕТ» ещё есть. */
function mated(game = new TurboGame(anarchyPosition())): TurboGame {
  for (const [from, to] of [
    ["f2", "f3"],
    ["e7", "e5"],
    ["g2", "g4"],
    ["d8", "h4"],
  ] as const) {
    game.move({ from, to }, game.ply());
  }
  return game;
}

describe("анархия: кнопка «НЕТ»", () => {
  it("по четыре на сторону", () => {
    const position = anarchyPosition();

    assert.deepEqual(position.vetoes, [VETOES, VETOES]);
    assert.equal(position.rules.anarchy, true);
  });

  it("отменяет чужой ход, тратит «НЕТ» и запрещает повтор", () => {
    const game = new TurboGame(anarchyPosition());
    game.move({ from: "e2", to: "e4" }, 0);
    game.move({ from: "e7", to: "e5" }, 1);

    assert.equal(game.veto(0)?.san, "e5", "отменили чужой ход");
    assert.equal(game.turn(), 1, "ходить снова сопернику");
    assert.equal(game.position().vetoes[0], VETOES - 1);
    assert.ok(
      !game.legal().some((move) => move.from === "e7" && move.to === "e5"),
      "тот же ход повторить нельзя",
    );
    assert.ok(
      game.legal().some((move) => move.from === "e7" && move.to === "e6"),
      "а другой — пожалуйста",
    );
  });

  it("два «НЕТ» подряд на один ход не бывает", () => {
    const game = new TurboGame(anarchyPosition());
    game.move({ from: "e2", to: "e4" }, 0);
    game.move({ from: "e7", to: "e5" }, 1);

    assert.ok(game.veto(0));
    assert.equal(game.veto(0), null, "новый ход ещё не сделан");
  });

  it("свой ход не отменить", () => {
    const game = new TurboGame(anarchyPosition());
    game.move({ from: "e2", to: "e4" }, 0);

    assert.equal(game.veto(0), null, "ходят чёрные — белым отменять нечего");
  });

  it("«НЕТ» кончились — кнопка молчит", () => {
    const game = new TurboGame({ ...anarchyPosition(), vetoes: [0, 0] });
    game.move({ from: "e2", to: "e4" }, 0);
    game.move({ from: "e7", to: "e5" }, 1);

    assert.equal(game.veto(0), null);
  });
});

describe("анархия: мат", () => {
  it("мат не кончает партию, пока есть чем сказать нет", () => {
    const game = mated();

    assert.equal(game.isOver(), false);
    assert.equal(game.veto(0)?.san, "Qh4#", "отменили мат");
    assert.equal(game.isOver(), false, "партия идёт дальше");
  });

  it("«НЕТ» кончились — мат снова мат", () => {
    const game = mated(new TurboGame({ ...anarchyPosition(), vetoes: [0, 0] }));

    assert.equal(game.outcome()?.reason, "checkmate");
  });

  it("правила игроку называют счёт и возврат времени", () => {
    const lines = anarchyRules().join(" ");

    assert.match(lines, /4 раза/);
    assert.match(lines, /другой ход/);
    assert.match(lines, /время/);
  });
});

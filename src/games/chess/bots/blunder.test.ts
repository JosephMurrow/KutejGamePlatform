import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseMove, variantsFor } from "./blunder";
import { LEVELS } from "./levels";
import type { Level } from "./levels";
import type { Candidate } from "./engine";

/** Ход выбранного кандидата: сам выбор проверяется по нему. */
const moveOf = (
  candidates: readonly Candidate[],
  level: Level,
  random: () => number,
): string | null => chooseMove(candidates, level, random)?.move ?? null;

/** Кандидаты от лучшего к худшему. */
const CANDIDATES = [
  { move: "e2e4", score: 30 },
  { move: "d2d4", score: -40 },
  { move: "g1f3", score: -120 },
  // Отдать ферзя: такой ход читается как баг, а не как слабая игра.
  { move: "d1h5", score: -900 },
];

describe("выбор хода ботом", () => {
  it("без ошибки берёт лучший", () => {
    // random вернёт единицу — ошибаться не будем.
    assert.equal(
      moveOf(CANDIDATES, LEVELS.easy, () => 1),
      "e2e4",
    );
  });

  it("ошибаясь, не отдаёт ферзя", () => {
    // random вернёт ноль — ошибка обязательна.
    const move = moveOf(CANDIDATES, LEVELS.easy, () => 0);

    assert.notEqual(move, "d1h5", "подстава ферзя — не ошибка, а баг");
    assert.equal(move, "g1f3", "берётся худший из допустимых");
  });

  it("на сильных уровнях порог уже, и ошибаться нечем", () => {
    // Сложному позволено потерять полпешки. Ближайший кандидат хуже на семь
    // десятых — за порогом, значит ошибки не будет вовсе.
    assert.equal(
      moveOf(CANDIDATES, LEVELS.hard, () => 0),
      "e2e4",
    );

    // А если рядом есть почти равный ход — сложный его и возьмёт.
    const close = [
      { move: "e2e4", score: 30 },
      { move: "c2c4", score: 0 },
      { move: "b1c3", score: -400 },
    ];
    assert.equal(
      moveOf(close, LEVELS.hard, () => 0),
      "c2c4",
    );
  });

  it("эксперт не ошибается вовсе", () => {
    assert.equal(
      moveOf(CANDIDATES, LEVELS.expert, () => 0),
      "e2e4",
    );
    assert.equal(variantsFor(LEVELS.expert), 1, "и вариантов ему не надо");
  });

  it("когда выбирать не из чего, берёт что есть", () => {
    const only = [{ move: "e2e4", score: 10 }];

    assert.equal(
      moveOf(only, LEVELS.easy, () => 0),
      "e2e4",
    );
    assert.equal(
      moveOf([], LEVELS.easy, () => 0),
      null,
    );
  });

  it("просит у движка несколько вариантов только там, где ошибается", () => {
    assert.ok(variantsFor(LEVELS.easy) > 1);
    assert.equal(variantsFor(LEVELS.expert), 1);
  });

  it("характеру с прихотями варианты нужны и на самом сильном уровне", () => {
    assert.ok(
      variantsFor(LEVELS.expert, true) > 1,
      "выбирать манеру не из чего, если движок прислал один ход",
    );
  });
});

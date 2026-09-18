import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { roller } from "../modes/random";
import { CHARACTER_TRAITS } from "./characters";
import { LEVELS } from "./levels";
import { pick, sloppinessOf } from "./blunder";
import type { Candidate } from "./search";

/**
 * Зевки уровня. Проверяется, что слабый уровень ошибается, сильный не
 * ошибается, и что ошибка остаётся в известных пределах: «ферзь под пешку»
 * читается как поломка, а не как слабая игра.
 */

/** Кандидаты нам нужны только оценками: ход подставной. */
function candidates(...scores: number[]): Candidate[] {
  return scores.map(
    (score) => ({ score, move: { to: score } }) as unknown as Candidate,
  );
}

describe("склонность к ошибке", () => {
  it("эксперт не ошибается, лёгкий ошибается часто", () => {
    const steady = sloppinessOf(LEVELS.expert, CHARACTER_TRAITS.strategist, 0);
    const weak = sloppinessOf(LEVELS.easy, CHARACTER_TRAITS.strategist, 0);

    assert.equal(steady.chance, 0);
    assert.ok(weak.chance >= 0.35);
  });

  it("характер добавляет своё: пьянчуга зевает и на эксперте", () => {
    const sober = sloppinessOf(LEVELS.expert, CHARACTER_TRAITS.strategist, 0);
    const drunk = sloppinessOf(LEVELS.expert, CHARACTER_TRAITS.drunk, 0);

    assert.equal(sober.chance, 0);
    assert.ok(drunk.chance > 0);
    // Но допуск ошибки остаётся: характеру не дано ошибаться как угодно сильно.
    assert.ok(drunk.maxLoss > 0 && drunk.maxLoss <= 100);
  });

  it("сбитый лётчик сдаёт к концу партии", () => {
    const fresh = sloppinessOf(LEVELS.hard, CHARACTER_TRAITS.pilot, 0);
    const late = sloppinessOf(LEVELS.hard, CHARACTER_TRAITS.pilot, 80);

    assert.ok(late.chance > fresh.chance);
  });

  it("как бы ни сложилось, чаще двух ходов из трёх бот не ошибается", () => {
    const worst = sloppinessOf(LEVELS.easy, CHARACTER_TRAITS.drunk, 400);
    assert.ok(worst.chance <= 0.66);
  });
});

describe("выбор хода", () => {
  it("без склонности к ошибке берётся лучший", () => {
    const chosen = pick(
      candidates(100, 60, 20),
      { chance: 0, maxLoss: 0 },
      roller(1),
    );
    assert.equal(chosen?.score, 100);
  });

  it("ошибка берётся только из допустимо худших", () => {
    // Второй ход хуже на 30 — годится; третий хуже на 400 — нет.
    const always = { chance: 1, maxLoss: 50 };
    for (let seed = 0; seed < 20; seed++) {
      const chosen = pick(candidates(100, 70, -300), always, roller(seed));
      assert.equal(chosen?.score, 70, `зерно ${seed}`);
    }
  });

  it("нет подходящей ошибки — играется лучший ход", () => {
    const chosen = pick(
      candidates(100, -900),
      { chance: 1, maxLoss: 50 },
      roller(3),
    );
    assert.equal(chosen?.score, 100);
  });

  it("лёгкий уровень на сотне ходов ошибается, но не всегда", () => {
    const level = LEVELS.easy;
    const slop = sloppinessOf(level, CHARACTER_TRAITS.strategist, 0);
    let mistakes = 0;

    for (let seed = 0; seed < 100; seed++) {
      const chosen = pick(candidates(100, 80, 60), slop, roller(seed));
      if (chosen?.score !== 100) mistakes++;
    }

    assert.ok(mistakes > 10, `ошибок слишком мало: ${mistakes}`);
    assert.ok(mistakes < 70, `ошибок слишком много: ${mistakes}`);
  });

  it("кандидатов нет — и хода нет", () => {
    assert.equal(pick([], { chance: 0, maxLoss: 0 }, roller(1)), null);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NEVER } from "./bet";
import { distance, MAX_MISS_FACTOR, resolveRound } from "./scoring";

describe("distance", () => {
  it("считает промах по порядку величины", () => {
    assert.equal(distance(1000, 100), 1);
    assert.equal(distance(100, 1000), 1);
    assert.equal(distance(500, 500), 0);
  });

  it("считает «Бесплатно» самой низкой ставкой против числового ответа", () => {
    assert.equal(distance(0, 100), 2);
  });

  it("не сравнивает отказ с суммой", () => {
    assert.equal(distance(NEVER, 1000), null);
    assert.equal(distance(1000, NEVER), null);
  });

  it("считает крайние ответы категориями, а не числами", () => {
    assert.equal(distance(NEVER, NEVER), 0);
    assert.equal(distance(0, 0), 0);
    // Рубль — это не «бесплатно», сравнивать их нельзя.
    assert.equal(distance(1, 0), null);
  });
});

describe("resolveRound: порог промаха", () => {
  it("не даёт очко единственной ставке, промахнувшейся мимо", () => {
    // Ровно тот случай, ради которого порог и вводился: вдвоём игрок
    // промахнулся в шестьсот раз и всё равно забирал очко.
    const outcome = resolveRound(150_000, [{ playerId: "один", bet: 250 }]);

    assert.deepEqual(outcome.winners, []);
  });

  it("даёт очко единственной ставке, если она уложилась в порог", () => {
    const outcome = resolveRound(150_000, [{ playerId: "один", bet: 120_000 }]);

    assert.deepEqual(outcome.winners, ["один"]);
  });

  it("пропускает ровно двукратный промах в обе стороны", () => {
    const half = resolveRound(100_000, [{ playerId: "вниз", bet: 50_000 }]);
    const double = resolveRound(100_000, [{ playerId: "вверх", bet: 200_000 }]);

    assert.deepEqual(half.winners, ["вниз"]);
    assert.deepEqual(double.winners, ["вверх"]);
  });

  it("отсекает промах чуть больше двукратного", () => {
    const outcome = resolveRound(100_000, [{ playerId: "мимо", bet: 210_000 }]);

    assert.deepEqual(outcome.winners, []);
  });

  it("ищет ближайшего только среди уложившихся в порог", () => {
    // По логарифму ближе «дальний», но он вне порога; очко забирает тот,
    // кто в порог уложился. Обратный порядок оставил бы раунд пустым.
    const outcome = resolveRound(100, [
      { playerId: "внутри", bet: 50 },
      { playerId: "снаружи", bet: 205 },
    ]);

    assert.deepEqual(outcome.winners, ["внутри"]);
  });

  it("оставляет раунд без победителя, если мимо все", () => {
    const outcome = resolveRound(100_000, [
      { playerId: "первый", bet: 100 },
      { playerId: "второй", bet: 50_000_000 },
    ]);

    assert.deepEqual(outcome.winners, []);
  });

  it("порог равен заявленному множителю", () => {
    assert.equal(MAX_MISS_FACTOR, 2);
  });
});

describe("resolveRound: выбор победителя", () => {
  it("выбирает ближайшего по порядку величины, а не по разнице в рублях", () => {
    // 130 000 промахивается в 1.3 раза, 70 000 — в 1.43; по абсолютной
    // разнице обе мимо на 30 000, по шкале порядков ближе первая.
    const outcome = resolveRound(100_000, [
      { playerId: "выше", bet: 130_000 },
      { playerId: "ниже", bet: 70_000 },
    ]);

    assert.deepEqual(outcome.winners, ["выше"]);
  });

  it("даёт очко всем при равном промахе", () => {
    const outcome = resolveRound(100_000, [
      { playerId: "меньше", bet: 50_000 },
      { playerId: "больше", bet: 200_000 },
    ]);

    assert.deepEqual([...outcome.winners].sort(), ["больше", "меньше"]);
  });

  it("отдаёт очко за точное совпадение", () => {
    const outcome = resolveRound(50_000, [
      { playerId: "точно", bet: 50_000 },
      { playerId: "мимо", bet: 60_000 },
    ]);

    assert.deepEqual(outcome.winners, ["точно"]);
    assert.equal(outcome.distances["точно"], 0);
  });

  it("не даёт отказавшемуся выиграть у числового ответа", () => {
    const outcome = resolveRound(1000, [
      { playerId: "отказ", bet: NEVER },
      { playerId: "рядом", bet: 1500 },
    ]);

    assert.deepEqual(outcome.winners, ["рядом"]);
    assert.equal(outcome.distances["отказ"], null);
  });

  it("оставляет раунд без победителя, если ставок не было", () => {
    assert.deepEqual(resolveRound(1000, []).winners, []);
    assert.deepEqual(resolveRound(NEVER, []).winners, []);
  });

  it("не теряет победителя из-за погрешности логарифмов", () => {
    const outcome = resolveRound(100_000, [
      { playerId: "вниз", bet: 50_000 },
      { playerId: "вверх", bet: 200_000 },
    ]);

    assert.deepEqual([...outcome.winners].sort(), ["вверх", "вниз"]);
  });
});

describe("resolveRound: крайние ответы ведущего", () => {
  it("при отказе награждает только тех, кто тоже отказался", () => {
    const outcome = resolveRound(NEVER, [
      { playerId: "первый", bet: NEVER },
      { playerId: "второй", bet: NEVER },
      { playerId: "третий", bet: 1_000_000_000 },
    ]);

    assert.deepEqual([...outcome.winners].sort(), ["второй", "первый"]);
  });

  it("при отказе без угадавших не даёт очко никому", () => {
    // Раньше утешительное очко забирала максимальная ставка — убрано.
    const outcome = resolveRound(NEVER, [
      { playerId: "скромный", bet: 1000 },
      { playerId: "щедрый", bet: 999_999_999 },
    ]);

    assert.deepEqual(outcome.winners, []);
  });

  it("при ответе «Бесплатно» требует ровно «Бесплатно»", () => {
    const outcome = resolveRound(0, [
      { playerId: "даром", bet: 0 },
      { playerId: "рубль", bet: 1 },
      { playerId: "сотня", bet: 100 },
    ]);

    assert.deepEqual(outcome.winners, ["даром"]);
    assert.equal(outcome.distances["рубль"], null);
  });

  it("при ответе «Бесплатно» без угадавших оставляет раунд пустым", () => {
    const outcome = resolveRound(0, [
      { playerId: "первый", bet: 1 },
      { playerId: "второй", bet: 10 },
    ]);

    assert.deepEqual(outcome.winners, []);
  });
});

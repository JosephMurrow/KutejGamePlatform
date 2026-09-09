import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MATE_SCORE } from "./engine";
import { MAX_PAUSE_MS, MIN_PAUSE_MS, pauseAfter } from "./tempo";

/** Разброс убираем: без него паузу не проверить числом. */
const steady = () => 0.5;

const close = [
  { move: "e2e4", score: 30 },
  { move: "d2d4", score: 20 },
];
const obvious = [
  { move: "e2e4", score: 500 },
  { move: "d2d4", score: -300 },
];

describe("пауза перед ходом", () => {
  it("включает время поиска, а не добавляется к нему", () => {
    const fast = pauseAfter({
      spentMs: 0,
      candidates: close,
      tempo: 1,
      limitMs: null,
      random: steady,
    });
    const slow = pauseAfter({
      spentMs: 800,
      candidates: close,
      tempo: 1,
      limitMs: null,
      random: steady,
    });

    assert.equal(
      slow,
      Math.max(0, fast - 800),
      "поиск съедает паузу, а не удлиняет",
    );
  });

  it("над трудным выбором думает дольше, чем над очевидным", () => {
    const hard = pauseAfter({
      spentMs: 0,
      candidates: close,
      tempo: 1,
      limitMs: null,
      random: steady,
    });
    const easy = pauseAfter({
      spentMs: 0,
      candidates: obvious,
      tempo: 1,
      limitMs: null,
      random: steady,
    });

    assert.ok(hard > easy, `${hard} должно быть больше ${easy}`);
  });

  it("мат в один — не мгновенно", () => {
    const pause = pauseAfter({
      spentMs: 0,
      candidates: [{ move: "d1h5", score: MATE_SCORE - 1 }],
      tempo: 0.6,
      limitMs: null,
      random: steady,
    });

    assert.ok(pause >= MIN_PAUSE_MS, `${pause} мс — так люди не отвечают`);
  });

  it("не выходит за лимит на ход", () => {
    const pause = pauseAfter({
      spentMs: 0,
      candidates: close,
      tempo: 1.4,
      limitMs: 10_000,
      random: steady,
    });

    assert.ok(pause <= 5000, "половина лимита — потолок");
  });

  it("даже без лимита есть потолок", () => {
    const pause = pauseAfter({
      spentMs: 0,
      candidates: close,
      tempo: 10,
      limitMs: null,
      random: () => 1,
    });

    assert.ok(pause <= MAX_PAUSE_MS);
  });

  it("характеры отвечают с разной скоростью", () => {
    const at = (tempo: number) =>
      pauseAfter({
        spentMs: 0,
        candidates: close,
        tempo,
        limitMs: null,
        random: steady,
      });

    assert.ok(at(0.6) < at(1.4), "быдло рубит быстрее, чем дед");
  });

  it("думать дольше положенного не заставляет", () => {
    const pause = pauseAfter({
      spentMs: 60_000,
      candidates: close,
      tempo: 1,
      limitMs: null,
      random: steady,
    });

    assert.equal(pause, 0);
  });
});

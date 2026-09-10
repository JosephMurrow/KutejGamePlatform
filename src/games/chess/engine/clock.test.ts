import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MoveClock } from "./clock";

/** Управляемые монотонные часы. */
function ticker() {
  let at = 1000;
  return {
    now: () => at,
    pass: (ms: number) => {
      at += ms;
    },
  };
}

describe("часы на ход", () => {
  it("до первого хода стоят", () => {
    const time = ticker();
    const clock = new MoveClock(10_000, time.now);

    assert.equal(clock.running, false);
    assert.equal(clock.left(), null);
    assert.equal(clock.expired(), false);
  });

  it("считают остаток и падают флагом", () => {
    const time = ticker();
    const clock = new MoveClock(10_000, time.now);
    clock.restart();

    time.pass(4000);
    assert.equal(clock.left(), 6000);
    assert.equal(clock.expired(), false);

    time.pass(6000);
    assert.equal(clock.left(), 0);
    assert.equal(clock.expired(), true);
  });

  it("после хода счёт начинается заново", () => {
    const time = ticker();
    const clock = new MoveClock(10_000, time.now);
    clock.restart();

    time.pass(9000);
    clock.restart();

    assert.equal(clock.left(), 10_000, "лимит на ход, а не на партию");
  });

  it("безлимит не даёт ни остатка, ни флага", () => {
    const time = ticker();
    const clock = new MoveClock(null, time.now);
    clock.restart();

    time.pass(10 * 60 * 60 * 1000);
    assert.equal(clock.limited, false);
    assert.equal(clock.left(), null, "платформе нечего заводить");
    assert.equal(clock.expired(), false);
  });

  it("остановленные часы времени не считают", () => {
    const time = ticker();
    const clock = new MoveClock(10_000, time.now);
    clock.restart();
    clock.stop();

    time.pass(60_000);
    assert.equal(clock.left(), null);
    assert.equal(clock.expired(), false);
  });
});

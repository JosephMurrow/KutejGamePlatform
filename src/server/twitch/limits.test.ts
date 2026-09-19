import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TwitchLimits } from "./limits";

/**
 * Лимиты моста в Твич: чужой большой канал не должен превращать каждую
 * ставку нового зрителя в запись в базе (docs/SECURITY.md, S-F1).
 */

const settings = { channels: 2, seatsPerRoom: 5, seatsPerMinute: 3 };

describe("лимиты моста в Твич", () => {
  it("каналов не больше потолка", () => {
    const limits = new TwitchLimits(settings);

    assert.equal(limits.canAttach(0), true);
    assert.equal(limits.canAttach(1), true);
    assert.equal(limits.canAttach(2), false);
  });

  it("лавина новых зрителей садится порциями", () => {
    const limits = new TwitchLimits(settings);

    for (let n = 0; n < 3; n++)
      assert.equal(limits.canSeat("room", n, n), true);
    assert.equal(limits.canSeat("room", 3, 10), false);
    // Через минуту — следующая порция.
    assert.equal(limits.canSeat("room", 3, 60_010), true);
  });

  it("комнаты считаются отдельно", () => {
    const limits = new TwitchLimits(settings);

    for (let n = 0; n < 3; n++) limits.canSeat("a", n, n);
    assert.equal(limits.canSeat("b", 0, 10), true);
  });

  it("за столом не больше потолка, сколько бы минут ни прошло", () => {
    const limits = new TwitchLimits(settings);

    assert.equal(limits.canSeat("room", 5, 0), false);
    assert.equal(limits.canSeat("room", 5, 10 * 60_000), false);
  });

  it("отказ по потолку стола не тратит минутный лимит", () => {
    const limits = new TwitchLimits(settings);

    for (let n = 0; n < 10; n++) limits.canSeat("room", 5, n);
    for (let n = 0; n < 3; n++) {
      assert.equal(limits.canSeat("room", 2, 20 + n), true);
    }
  });
});

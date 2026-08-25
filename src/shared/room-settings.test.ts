import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_REVEAL_MS,
  parseRevealMs,
  REVEAL_CHOICES,
} from "./room-settings";

describe("Время вскрытия", () => {
  it("принимает любое значение из списка", () => {
    for (const choice of REVEAL_CHOICES) {
      assert.equal(parseRevealMs(choice.value), choice.value);
    }
  });

  it("принимает то же значение строкой — форма шлёт строки", () => {
    assert.equal(parseRevealMs("5000"), 5_000);
  });

  it("на постороннее число откатывается к умолчанию", () => {
    assert.equal(parseRevealMs(7_000), DEFAULT_REVEAL_MS);
    assert.equal(parseRevealMs(0), DEFAULT_REVEAL_MS);
    assert.equal(parseRevealMs(-5_000), DEFAULT_REVEAL_MS);
  });

  it("на мусор не падает", () => {
    assert.equal(parseRevealMs(undefined), DEFAULT_REVEAL_MS);
    assert.equal(parseRevealMs(null), DEFAULT_REVEAL_MS);
    assert.equal(parseRevealMs("побыстрее"), DEFAULT_REVEAL_MS);
  });
});

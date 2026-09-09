import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Matchmaker } from "./matchmaker";

describe("очередь общего зала", () => {
  it("сажает двоих, как только их двое", () => {
    const queue = new Matchmaker();
    queue.enter("a", 1);
    assert.deepEqual(queue.pairs(), [], "одному играть не с кем");

    queue.enter("b", 2);
    assert.deepEqual(queue.pairs(), [["a", "b"]]);
    assert.equal(queue.waiting().length, 0, "оба ушли за доску");
  });

  it("собирает несколько пар разом и оставляет лишнего ждать", () => {
    const queue = new Matchmaker();
    for (const [id, at] of [
      ["a", 1],
      ["b", 2],
      ["c", 3],
      ["d", 4],
      ["e", 5],
    ] as const) {
      queue.enter(id, at);
    }

    assert.deepEqual(queue.pairs(), [
      ["a", "b"],
      ["c", "d"],
    ]);
    assert.deepEqual(
      queue.waiting().map((waiting) => waiting.id),
      ["e"],
      "нечётный остаётся в очереди",
    );
  });

  it("сажает в порядке очереди: пришёл раньше — сел раньше", () => {
    const queue = new Matchmaker();
    queue.enter("поздний", 100);
    queue.enter("ранний", 1);

    // Порядок — по входу в очередь, а не по времени: очередь и есть порядок.
    assert.deepEqual(queue.pairs(), [["поздний", "ранний"]]);
  });

  it("повторный вход не двоит человека", () => {
    const queue = new Matchmaker();
    queue.enter("a", 1);
    queue.enter("a", 2);

    assert.equal(queue.waiting().length, 1);
    assert.deepEqual(queue.pairs(), [], "сам с собой не играют");
  });

  it("ушедшего из очереди не сажают", () => {
    const queue = new Matchmaker();
    queue.enter("a", 1);
    queue.enter("b", 2);
    queue.leave("a");

    assert.equal(queue.waits("a"), false);
    assert.deepEqual(queue.pairs(), []);
    assert.deepEqual(
      queue.waiting().map((w) => w.id),
      ["b"],
    );
  });
});

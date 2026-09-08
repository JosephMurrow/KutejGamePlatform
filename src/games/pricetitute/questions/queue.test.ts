import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QuestionQueue, type Rng } from "./queue";

/** Детерминированный генератор: прокручивает заданную последовательность. */
function seededRng(values: number[]): Rng {
  let index = 0;
  return () => {
    const value = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
}

/** Пул из n вопросов: q0, q1, … */
function pool(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `q${i}`);
}

describe("QuestionQueue", () => {
  it("выдаёт весь пул без повторов до исчерпания", () => {
    const ids = pool(20);
    const queue = QuestionQueue.create(ids, seededRng([0.1, 0.7, 0.3, 0.9]));

    const seen = new Set<string>();
    for (let i = 0; i < ids.length; i++) {
      const id = queue.next();
      assert.ok(id, "очередь не должна опустеть раньше времени");
      assert.ok(!seen.has(id), `вопрос ${id} выдан повторно`);
      seen.add(id);
    }

    assert.equal(seen.size, ids.length);
    assert.equal(queue.remaining, 0);
  });

  it("перемешивает пул заново, когда круг закончился", () => {
    const ids = pool(5);
    const queue = QuestionQueue.create(ids, seededRng([0.42]));

    for (let i = 0; i < ids.length; i++) queue.next();
    assert.equal(queue.remaining, 0);

    const afterReshuffle = queue.next();
    assert.ok(afterReshuffle);
    assert.equal(queue.remaining, ids.length - 1);
    assert.deepEqual(queue.snapshot().consumed, [afterReshuffle]);
  });

  it("возвращает сгоревший вопрос в нижнюю треть очереди", () => {
    const ids = pool(30);
    // rng всегда 0 — сгоревший встанет в самое начало зоны возврата.
    const queue = QuestionQueue.create(ids, seededRng([0]));

    const burned = queue.next();
    assert.ok(burned);

    const before = queue.remaining;
    queue.burn(burned);
    assert.equal(queue.remaining, before + 1);

    const position = queue.snapshot().queue.indexOf(burned);
    const zoneStart = Math.floor(before * (1 - 1 / 3));
    assert.ok(
      position >= zoneStart,
      `сгоревший вопрос встал на позицию ${position}, а зона возврата начинается с ${zoneStart}`,
    );
  });

  it("не даёт сгоревшему вопросу выпасть следующим же ходом", () => {
    const ids = pool(30);
    const queue = QuestionQueue.create(ids, seededRng([0.1, 0.5, 0.9, 0.3]));

    const burned = queue.next();
    assert.ok(burned);
    queue.burn(burned);

    // Проходим первую треть очереди — сгоревшего там быть не должно.
    const safeSteps = Math.floor(queue.remaining / 3);
    for (let i = 0; i < safeSteps; i++) {
      assert.notEqual(queue.next(), burned);
    }
  });

  it("забывает сгоревший вопрос как выданный", () => {
    const queue = QuestionQueue.create(pool(10), seededRng([0.3]));

    const burned = queue.next();
    assert.ok(burned);
    queue.burn(burned);

    assert.ok(!queue.snapshot().consumed.includes(burned));
  });

  it("игнорирует возврат вопроса не из пула", () => {
    const queue = QuestionQueue.create(pool(5), seededRng([0.5]));
    const before = queue.remaining;

    queue.burn("чужой-вопрос");

    assert.equal(queue.remaining, before);
    assert.ok(!queue.snapshot().queue.includes("чужой-вопрос"));
  });

  it("восстанавливает сохранённый порядок", () => {
    const ids = pool(6);
    const saved = { queue: ["q3", "q1", "q5"], consumed: ["q0", "q2", "q4"] };
    const queue = QuestionQueue.restore(ids, saved, seededRng([0.5]));

    assert.equal(queue.next(), "q3");
    assert.equal(queue.next(), "q1");
    assert.equal(queue.next(), "q5");
  });

  it("не возвращает в очередь уже показанные вопросы после перезапуска", () => {
    const ids = pool(10);
    const queue = QuestionQueue.create(ids, seededRng([0.2, 0.8, 0.4]));

    const shown = [queue.next(), queue.next(), queue.next()];
    const restored = QuestionQueue.restore(
      ids,
      queue.snapshot(),
      seededRng([0.5]),
    );

    assert.equal(restored.remaining, ids.length - shown.length);
    for (const id of shown) {
      assert.ok(id);
      assert.ok(
        !restored.snapshot().queue.includes(id),
        `показанный вопрос ${id} вернулся в очередь`,
      );
    }
  });

  it("дописывает новые вопросы пула в хвост восстановленной очереди", () => {
    const queue = QuestionQueue.restore(
      pool(6),
      { queue: ["q0", "q1"], consumed: [] },
      seededRng([0.5]),
    );

    assert.equal(queue.remaining, 6);
    const tail = queue.snapshot().queue.slice(2);
    assert.deepEqual([...tail].sort(), ["q2", "q3", "q4", "q5"]);
  });

  it("выбрасывает из восстановленной очереди исчезнувшие вопросы", () => {
    const queue = QuestionQueue.restore(
      ["q0", "q1"],
      { queue: ["q0", "удалённый", "q1"], consumed: ["тоже-удалённый"] },
      seededRng([0.5]),
    );

    assert.deepEqual(queue.snapshot().queue, ["q0", "q1"]);
    assert.deepEqual(queue.snapshot().consumed, []);
  });

  it("на пустом пуле отдаёт null, а не зацикливается", () => {
    const queue = QuestionQueue.create([], seededRng([0.5]));
    assert.equal(queue.next(), null);
    assert.equal(queue.next(), null);
  });
});

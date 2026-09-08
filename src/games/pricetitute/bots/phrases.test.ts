import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PHRASE_COOLDOWN_MS, PhraseMemory } from "./phrases";

/** Всегда берёт первый из доступных: так выбор становится предсказуемым. */
const first = () => 0;

describe("Память о сказанных фразах", () => {
  it("не повторяет только что сказанное", () => {
    const memory = new PhraseMemory();
    const pool = ["раз", "два", "три"];

    assert.equal(memory.pick(pool, 0, first), "раз");
    assert.equal(memory.pick(pool, 1000, first), "два");
    assert.equal(memory.pick(pool, 2000, first), "три");
  });

  it("возвращает фразу в оборот через пять минут", () => {
    const memory = new PhraseMemory();
    const pool = ["раз", "два"];

    memory.pick(pool, 0, first);
    memory.pick(pool, 1000, first);

    // Обе сказаны, но первая уже остыла.
    assert.equal(memory.pick(pool, PHRASE_COOLDOWN_MS, first), "раз");
  });

  it("не отдаёт фразу за миг до остывания", () => {
    const memory = new PhraseMemory();
    const pool = ["раз", "два"];

    memory.pick(pool, 0, first);
    assert.equal(memory.pick(pool, PHRASE_COOLDOWN_MS - 1, first), "два");
  });

  it("когда весь набор горячий, берёт молчавшую дольше всех", () => {
    const memory = new PhraseMemory();
    const pool = ["раз", "два"];

    memory.pick(pool, 0, first); // раз
    memory.pick(pool, 5000, first); // два

    // Обе сказаны недавно, но «раз» молчит дольше.
    assert.equal(memory.pick(pool, 10_000, first), "раз");
  });

  it("на исчерпанном наборе не молчит, а повторяется по кругу", () => {
    const memory = new PhraseMemory();
    const pool = ["раз", "два"];

    const said = [
      memory.pick(pool, 0, first),
      memory.pick(pool, 100, first),
      memory.pick(pool, 200, first),
      memory.pick(pool, 300, first),
    ];

    assert.deepEqual(said, ["раз", "два", "раз", "два"]);
  });

  it("считает память по каждой фразе отдельно", () => {
    const memory = new PhraseMemory();

    memory.pick(["общая"], 0, first);
    // Другой набор с той же фразой внутри — она всё ещё горячая.
    assert.equal(memory.pick(["общая", "своя"], 1000, first), "своя");
  });

  it("после очистки начинает с чистого листа", () => {
    const memory = new PhraseMemory();
    const pool = ["раз", "два"];

    memory.pick(pool, 0, first);
    memory.clear();

    assert.equal(memory.pick(pool, 1000, first), "раз");
  });

  it("на пустом наборе отдаёт null, а не падает", () => {
    assert.equal(new PhraseMemory().pick([], 0, first), null);
  });
});

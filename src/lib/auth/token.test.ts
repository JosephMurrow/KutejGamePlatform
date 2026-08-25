import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionAlive } from "./token";

const at = (iso: string) => new Date(iso);

describe("Отзыв сессий", () => {
  it("без отметки живут все сессии", () => {
    assert.equal(sessionAlive(at("2020-01-01T00:00:00Z"), null), true);
  });

  it("сессия, выданная после смены пароля, продолжает работать", () => {
    assert.equal(
      sessionAlive(at("2026-08-25T12:00:05Z"), at("2026-08-25T12:00:00Z")),
      true,
    );
  });

  it("сессия, выданная до смены пароля, перестаёт работать", () => {
    assert.equal(
      sessionAlive(at("2026-08-25T11:59:59Z"), at("2026-08-25T12:00:00Z")),
      false,
    );
  });

  it("выданная в ту же секунду остаётся живой", () => {
    // В токене время выпуска хранится с точностью до секунды. Без округления
    // сессия, выданная сразу после смены пароля, отвалилась бы на ровном месте.
    assert.equal(
      sessionAlive(
        at("2026-08-25T12:00:00.400Z"),
        at("2026-08-25T12:00:00.900Z"),
      ),
      true,
    );
  });

  it("разница в доли секунды в другую сторону тоже не мешает", () => {
    assert.equal(
      sessionAlive(
        at("2026-08-25T12:00:00.900Z"),
        at("2026-08-25T12:00:00.100Z"),
      ),
      true,
    );
  });
});

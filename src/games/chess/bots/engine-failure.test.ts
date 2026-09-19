import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UciEngine } from "./engine";

/**
 * Движок, который не запустился, — внешний сбой уровня 1: ботов нет, сервер
 * живёт (docs/SECURITY.md, S-E4). Раньше у процесса не было слушателя
 * `error`, и несуществующий путь становился uncaughtException всего сервера.
 */

describe("движок шахмат не запустился", () => {
  it("несуществующий путь — отказ, а не падение процесса", async () => {
    let uncaught: unknown = null;
    const catcher = (error: unknown) => {
      uncaught = error;
    };
    process.on("uncaughtException", catcher);

    try {
      await assert.rejects(
        UciEngine.start("/nonexistent/stockfish-for-test"),
        /движок не ответил/,
      );
      // Дать событиям процесса долететь.
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(uncaught, null);
    } finally {
      process.off("uncaughtException", catcher);
    }
  });
});

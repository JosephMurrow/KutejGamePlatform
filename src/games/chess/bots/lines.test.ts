import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LINES } from "./lines";
import { CHARACTERS, MOMENTS } from "./moments";

/**
 * Сколько реплик положено на момент.
 *
 * Число не круглое ради красоты: сорок — это столько, чтобы за партию из
 * шестидесяти ходов бот ни разу не повторился даже в самом частом моменте.
 */
const PER_MOMENT = 40;

describe("наборы реплик", () => {
  it("у каждого характера есть все моменты", () => {
    for (const character of CHARACTERS) {
      const lines = LINES[character];
      assert.deepEqual(
        Object.keys(lines).sort(),
        [...MOMENTS].sort(),
        `${character}: моменты не совпадают со списком`,
      );
    }
  });

  it("на каждый момент — по сорок реплик", () => {
    for (const character of CHARACTERS) {
      for (const moment of MOMENTS) {
        assert.equal(
          LINES[character][moment].length,
          PER_MOMENT,
          `${character}/${moment}`,
        );
      }
    }
  });

  it("внутри момента реплики не повторяются", () => {
    for (const character of CHARACTERS) {
      for (const moment of MOMENTS) {
        const pool = LINES[character][moment];
        assert.equal(
          new Set(pool).size,
          pool.length,
          `${character}/${moment}: есть дубли`,
        );
      }
    }
  });

  it("реплики непустые и короткие", () => {
    for (const character of CHARACTERS) {
      for (const moment of MOMENTS) {
        for (const line of LINES[character][moment]) {
          assert.ok(line.trim().length > 0, `${character}/${moment}: пусто`);
          // Реплика идёт в чат рядом с доской: длинная там не читается.
          assert.ok(
            line.length <= 90,
            `${character}/${moment}: слишком длинно — ${line}`,
          );
        }
      }
    }
  });

  it("характеры говорят по-разному", () => {
    // Одна и та же фраза у двоих означает, что кто-то из них безлик.
    for (const moment of MOMENTS) {
      const seen = new Map<string, string>();
      for (const character of CHARACTERS) {
        for (const line of LINES[character][moment]) {
          const owner = seen.get(line);
          assert.equal(
            owner,
            undefined,
            `${moment}: «${line}» есть и у ${owner}, и у ${character}`,
          );
          seen.set(line, character);
        }
      }
    }
  });
});

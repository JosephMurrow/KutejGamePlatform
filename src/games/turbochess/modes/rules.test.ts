import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classicPosition } from "../engine/position";
import { MODES } from "./catalog";
import { isReady, modeOptions, rulesOf, startPosition } from "./rules";

describe("каркас режимов", () => {
  it("одновидовые встают своей расстановкой, остальные — обычной", () => {
    const knights = startPosition("ONE_KIND", { kind: "n" });
    assert.deepEqual(knights.board[1], { kind: "n", side: 0 });

    for (const mode of ["CLASSIC", "MEGA", "BINGE"] as const) {
      assert.deepEqual(
        startPosition(mode, {}).board,
        classicPosition().board,
        mode,
      );
    }
  });

  it("ручки читает только сам режим", () => {
    const field = (name: string) => (name === "oneKind" ? "b" : "лишнее");

    assert.deepEqual(modeOptions("ONE_KIND", field), { kind: "b" });
    assert.deepEqual(modeOptions("MEGA", field), {});
  });

  it("у каждого режима есть правила; готовые — одновидовые и классика", () => {
    for (const { id } of MODES) {
      const rules = rulesOf(id, {});
      assert.ok(rules.lines.length > 0, id);
      assert.equal(rules.ready, isReady(id), id);
    }
    assert.equal(isReady("ONE_KIND"), true);
    assert.equal(isReady("CLASSIC"), true);
    assert.equal(isReady("BINGE"), false);
    assert.equal(rulesOf("ONE_KIND", { kind: "r" }).variant, "все — ладьи");
  });
});

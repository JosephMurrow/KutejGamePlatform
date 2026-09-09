import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MoveShape } from "../engine/rules";
import { CHARACTER_TRAITS, hasStyle } from "./characters";
import { preferStyle, STYLE_BUDGET } from "./style";

const quiet: MoveShape = {
  san: "Nf3",
  captured: null,
  check: false,
  promotion: false,
  castle: false,
};
const shapes: Record<string, MoveShape> = {
  e2e4: quiet,
  g1f3: quiet,
  d1h5: { ...quiet, san: "Qh5+", check: true },
  f1c4: { ...quiet, san: "Bxc4", captured: "p" },
  e1g1: { ...quiet, san: "O-O", castle: true },
};
const describe_ = (uci: string) => shapes[uci] ?? null;

describe("манера характера", () => {
  it("быдло из равноценных берёт взятие", () => {
    const candidates = [
      { move: "e2e4", score: 30 },
      { move: "f1c4", score: 10 },
    ];

    const [best] = preferStyle(
      candidates,
      CHARACTER_TRAITS.brute.style,
      describe_,
    );

    assert.equal(best?.move, "f1c4", "разница в двадцать сотых — не разница");
  });

  it("педант из тех же берёт рокировку, а не шах", () => {
    const candidates = [
      { move: "d1h5", score: 30 },
      { move: "e1g1", score: 5 },
    ];

    const [best] = preferStyle(
      candidates,
      CHARACTER_TRAITS.pedant.style,
      describe_,
    );

    assert.equal(best?.move, "e1g1");
  });

  it("прихоть не выходит за коридор", () => {
    const candidates = [
      { move: "e2e4", score: 100 },
      // Взятие, но хуже лучшего на целую пешку: характер туда не дотянется.
      { move: "f1c4", score: 100 - STYLE_BUDGET - 1 },
    ];

    const [best] = preferStyle(
      candidates,
      CHARACTER_TRAITS.brute.style,
      describe_,
    );

    assert.equal(best?.move, "e2e4", "манера не должна стоить материала");
  });

  it("у чемпиона прихотей нет: порядок движка сохраняется", () => {
    const candidates = [
      { move: "e2e4", score: 30 },
      { move: "f1c4", score: 20 },
      { move: "d1h5", score: 10 },
    ];

    assert.equal(hasStyle("champion"), false);
    assert.deepEqual(
      preferStyle(candidates, CHARACTER_TRAITS.champion.style, describe_),
      candidates,
    );
  });

  it("незнакомый ход не роняет выбор", () => {
    const candidates = [
      { move: "a2a3", score: 30 },
      { move: "f1c4", score: 25 },
    ];

    const shaped = preferStyle(
      candidates,
      CHARACTER_TRAITS.granddad.style,
      describe_,
    );

    assert.equal(shaped.length, 2, "ход без вида просто не получает надбавки");
  });
});

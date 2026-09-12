import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { squareName } from "../engine/geometry";
import { fromFen } from "../engine/fen";
import { classicPosition, type Position } from "../engine/position";
import { CHARACTER_TRAITS } from "./characters";
import { search } from "./search";
import { bonusOf, preferStyle, shapeOf, STYLE_BUDGET } from "./style";

/**
 * Манера характера. Главное правило: характер выбирает внутри коридора от
 * лучшего хода и за его пределы не лезет — иначе манера читается как поломка.
 */

function fen(text: string): Position {
  return fromFen(text, classicPosition().rules);
}

function first(position: Position, character: keyof typeof CHARACTER_TRAITS) {
  const { candidates } = search(position, { depth: 2, nodes: 20_000 });
  const sorted = preferStyle(
    position,
    candidates,
    CHARACTER_TRAITS[character].style,
  );
  const top = sorted[0];
  assert.ok(top);
  return squareName(position.geometry, top.move.to);
}

describe("манера характера", () => {
  it("разбирает ход: взятие, превращение, вперёд и на край", () => {
    const position = fen("4k3/8/8/8/8/8/1P6/4K3 w - - 0 1");
    const { candidates } = search(position, { depth: 1, nodes: 500 });
    const step = candidates.find(
      (candidate) => squareName(position.geometry, candidate.move.to) === "b3",
    );

    assert.ok(step);
    const shape = shapeOf(position, step.move);
    assert.equal(shape.forward, true);
    assert.equal(shape.back, false);
    assert.equal(shape.capture, false);
    assert.equal(shape.drop, false);
  });

  it("надбавка складывается из того, что характер любит", () => {
    const butcher = CHARACTER_TRAITS.butcher.style;
    const plain = {
      capture: false,
      check: false,
      promotion: false,
      castle: false,
      drop: false,
      forward: false,
      back: false,
      edge: false,
    };

    assert.equal(bonusOf(plain, butcher), 0);
    assert.equal(
      bonusOf({ ...plain, capture: true, check: true }, butcher),
      butcher.capture + butcher.check,
    );
  });

  it("равный размен: кровожадный рубит, кальянный мастер проходит мимо", () => {
    // Ладья берёт ладью, защищённую королём: размен равный, и перебору он
    // почти безразличен — значит слово за характером.
    const position = fen("1rk5/8/8/8/8/8/8/1R2K3 w - - 0 1");

    assert.equal(first(position, "butcher"), "b8");
    assert.notEqual(first(position, "hookah"), "b8");
  });

  it("стратег уводит короля, кровожадный не прячется", () => {
    const position = fen("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1");

    // Рокировка в обе стороны: стратег выбирает её, кровожадный — активность.
    assert.equal(first(position, "strategist"), "c1");
    assert.notEqual(first(position, "butcher"), "c1");
    assert.notEqual(first(position, "butcher"), "g1");
  });

  it("за коридор манера не выходит: ферзя даром не отдаст даже кровожадный", () => {
    // Взятие пешки ферзём проигрывает ферзя — это далеко за полпешки.
    const position = fen("4k3/1p6/2p5/8/8/8/8/3QK3 w - - 0 1");
    const { candidates } = search(position, { depth: 2, nodes: 20_000 });
    const best = candidates[0];
    const tasted = preferStyle(
      position,
      candidates,
      CHARACTER_TRAITS.butcher.style,
    );

    assert.ok(best);
    assert.ok(tasted[0]);
    assert.ok(best.score - tasted[0].score <= STYLE_BUDGET);
    assert.notEqual(squareName(position.geometry, tasted[0].move.to), "b7");
  });

  it("один кандидат — переставлять нечего", () => {
    const position = fen("4k3/8/8/8/8/8/8/4K2R w - - 0 1");
    const { candidates } = search(position, { depth: 1, nodes: 500 });
    const only = candidates.slice(0, 1);

    assert.deepEqual(
      preferStyle(position, only, CHARACTER_TRAITS.drunk.style),
      only,
    );
  });
});

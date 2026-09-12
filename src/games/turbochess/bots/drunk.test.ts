import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHARACTER_TRAITS } from "./characters";
import { LEVELS } from "./levels";
import { limitsFor, tipsy } from "./drunk";

/**
 * Выпитое портит игру — решение хозяина по алко-шахматам. Проверяется, что
 * деградация есть, что она упирается в пол и что характер на неё влияет.
 */

describe("бот и стопки", () => {
  it("трезвый играет в свою силу", () => {
    const sober = tipsy(LEVELS.expert, CHARACTER_TRAITS.physicist, 0);

    assert.equal(sober.depth, LEVELS.expert.depth);
    assert.equal(sober.sloppy, 0);
  });

  it("чем больше выпил, тем меньше видит и тем чаще зевает", () => {
    const level = LEVELS.expert;
    const traits = CHARACTER_TRAITS.physicist;

    const one = tipsy(level, traits, 2);
    const many = tipsy(level, traits, 12);

    assert.ok(many.depth < level.depth);
    assert.ok(many.sloppy > one.sloppy);
  });

  it("глубина падает до единицы и не ниже: в ноль бот не напивается", () => {
    const wasted = tipsy(LEVELS.expert, CHARACTER_TRAITS.drunk, 100);

    assert.equal(wasted.depth, 1);
    assert.ok(wasted.sloppy > 1, "зевки продолжают расти");
  });

  it("пьянчуга валится раньше физика", () => {
    const shots = 4;
    const drunk = tipsy(LEVELS.expert, CHARACTER_TRAITS.drunk, shots);
    const physicist = tipsy(LEVELS.expert, CHARACTER_TRAITS.physicist, shots);

    assert.ok(drunk.depth < physicist.depth);
    assert.ok(drunk.sloppy > physicist.sloppy);
  });

  it("потолок просмотра падает вместе с глубиной", () => {
    const full = limitsFor(LEVELS.expert, LEVELS.expert.depth);
    const cut = limitsFor(LEVELS.expert, 1);

    assert.equal(full.nodes, LEVELS.expert.nodes);
    assert.ok(cut.nodes < full.nodes);
    assert.ok(cut.nodes >= 200, "совсем без перебора бот не останется");
  });
});

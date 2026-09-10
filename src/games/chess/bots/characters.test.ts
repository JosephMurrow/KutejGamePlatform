import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHARACTER_TRAITS, hasStyle, nicknameOf } from "./characters";
import { CHARACTERS } from "./moments";

describe("характеры", () => {
  it("описаны все четверо", () => {
    assert.deepEqual(
      Object.keys(CHARACTER_TRAITS).sort(),
      [...CHARACTERS].sort(),
    );
  });

  it("у каждого свои ники, и они не пересекаются", () => {
    const all = CHARACTERS.flatMap(
      (character) => CHARACTER_TRAITS[character].nicknames,
    );

    assert.equal(new Set(all).size, all.length, "ники должны быть разные");
    for (const character of CHARACTERS) {
      assert.ok(
        CHARACTER_TRAITS[character].nicknames.length > 1,
        `${character}: одного ника мало, боты станут одинаковыми`,
      );
    }
  });

  it("ник берётся из своего набора", () => {
    for (const character of CHARACTERS) {
      const nickname = nicknameOf(character, () => 0.99);
      assert.ok(CHARACTER_TRAITS[character].nicknames.includes(nickname));
    }
  });

  it("прихоти есть у всех, кроме чемпиона", () => {
    assert.equal(hasStyle("champion"), false, "его манера — лучший ход");
    for (const character of CHARACTERS.filter((one) => one !== "champion")) {
      assert.equal(hasStyle(character), true, character);
    }
  });

  it("темп у всех разный: по одной скорости их уже видно", () => {
    const tempos = CHARACTERS.map(
      (character) => CHARACTER_TRAITS[character].tempo,
    );

    assert.equal(new Set(tempos).size, tempos.length);
    assert.ok(
      CHARACTER_TRAITS.brute.tempo < CHARACTER_TRAITS.granddad.tempo,
      "быдло рубит сплеча, дед сидит над ходом",
    );
  });
});

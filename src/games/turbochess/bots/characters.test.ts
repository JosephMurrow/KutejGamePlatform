import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { roller } from "../modes/random";
import {
  CHARACTERS,
  CHARACTER_TRAITS,
  characterOf,
  drawCharacters,
  nicknameOf,
} from "./characters";

/**
 * Характеры: одиннадцать, как описал хозяин. Тест следит за тем, чтобы список
 * не разъехался с таблицей и чтобы за одним столом не оказалось двух
 * одинаковых.
 */

describe("характеры ботов", () => {
  it("их одиннадцать, и у каждого есть имя, ники и манера", () => {
    assert.equal(CHARACTERS.length, 11);

    for (const id of CHARACTERS) {
      const traits = CHARACTER_TRAITS[id];
      assert.equal(traits.id, id);
      assert.ok(traits.title.length > 0, `${id}: нет названия`);
      assert.ok(traits.nicknames.length >= 3, `${id}: мало ников`);
      assert.ok(traits.tempo > 0, `${id}: темп не задан`);
    }
  });

  it("ники не повторяются между характерами", () => {
    const all = CHARACTERS.flatMap((id) => CHARACTER_TRAITS[id].nicknames);
    assert.equal(new Set(all).size, all.length);
  });

  it("характеры различимы манерой, а не только названием", () => {
    const manners = CHARACTERS.map((id) =>
      JSON.stringify(CHARACTER_TRAITS[id].style),
    );
    assert.equal(new Set(manners).size, manners.length);
  });

  it("кровожадный рубит, кальянный мастер не спешит", () => {
    assert.ok(CHARACTER_TRAITS.butcher.style.capture > 0);
    assert.ok(CHARACTER_TRAITS.hookah.style.capture < 0);
    assert.ok(CHARACTER_TRAITS.hookah.tempo > CHARACTER_TRAITS.granddad.tempo);
    assert.ok(CHARACTER_TRAITS.dwarf.style.promotion > 0);
    assert.ok(CHARACTER_TRAITS.strategist.style.castle > 0);
  });

  it("за столом характеры всегда разные, и ник берётся свой", () => {
    const roll = roller(7);
    const drawn = drawCharacters(3, roll);

    assert.equal(drawn.length, 3);
    assert.equal(new Set(drawn).size, 3);

    const nick = nicknameOf("granddad", 0);
    assert.ok(CHARACTER_TRAITS.granddad.nicknames.includes(nick));
    // Бросок на границе не вылетает за список.
    assert.ok(
      CHARACTER_TRAITS.granddad.nicknames.includes(nicknameOf("granddad", 1)),
    );
  });

  it("просят больше характеров, чем есть — отдаём сколько есть", () => {
    assert.equal(drawCharacters(20, roller(1)).length, 11);
  });

  it("незнакомый характер не роняет игру", () => {
    assert.equal(characterOf("борец").id, "drunk");
  });
});

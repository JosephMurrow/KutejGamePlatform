import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOT_AVATAR_OFFSET } from "./avatars";
import { CHARACTER_TRAITS } from "./characters";
import { LEVELS } from "./levels";
import { isBot, makeBots } from "./seat";

/**
 * Кто садится за стол. Главное здесь — что боты с одним зерном получаются
 * одинаковыми, а за одним столом всё равно разными.
 */

describe("боты за столом", () => {
  it("столько, сколько просили, и все с разными характерами", () => {
    const bots = makeBots(3, "hard", 777);

    assert.equal(bots.length, 3);
    assert.equal(new Set(bots.map((bot) => bot.character)).size, 3);
    for (const bot of bots) {
      assert.equal(bot.level, LEVELS.hard);
      assert.ok(CHARACTER_TRAITS[bot.character]);
      assert.ok(bot.traits.nicknames.includes(bot.nickname));
      assert.ok(bot.avatarId >= BOT_AVATAR_OFFSET);
    }
  });

  it("то же зерно — те же характеры: комната переживает перезапуск", () => {
    const before = makeBots(3, "normal", 42).map((bot) => bot.character);
    const after = makeBots(3, "normal", 42).map((bot) => bot.character);

    assert.deepEqual(after, before);
  });

  it("разные комнаты — разные столы", () => {
    const one = makeBots(3, "normal", 1).map((bot) => bot.character);
    const two = makeBots(3, "normal", 2).map((bot) => bot.character);

    assert.notDeepEqual(one, two);
  });

  it("лицо привязано к характеру, а не к месту за столом", () => {
    const table = makeBots(3, "normal", 9);
    const alone = makeBots(1, "normal", 9);
    const first = table[0];

    assert.ok(first && alone[0]);
    assert.equal(alone[0].character, first.character);
    assert.equal(alone[0].avatarId, first.avatarId);
  });

  it("просят больше, чем есть характеров — отдаём сколько есть", () => {
    assert.equal(makeBots(20, "easy", 3).length, 11);
    assert.equal(makeBots(0, "easy", 3).length, 0);
    assert.equal(makeBots(-2, "easy", 3).length, 0);
  });

  it("бота видно по номеру: у живых такого префикса не бывает", () => {
    const bot = makeBots(1, "easy", 5)[0];

    assert.ok(bot);
    assert.equal(isBot(bot.id), true);
    assert.equal(isBot("cme8s9a0k0000abcd"), false);
  });
});

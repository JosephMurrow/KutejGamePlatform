import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOT_AVATAR_OFFSET,
  BOT_COUNT,
  botAvatarId,
  botAvatarSrc,
} from "./avatars";

/**
 * Номера аватаров. Диапазон забронирован заранее, чтобы его не забрала
 * следующая игра; лиц пока нет — они ждут одобрения канвы (правило D0).
 */

describe("аватары ботов", () => {
  it("диапазон начинается с 1200: ниже заняты соседями", () => {
    assert.equal(BOT_AVATAR_OFFSET, 1200);
    assert.equal(botAvatarId(0), 1200);
  });

  it("адрес картинки — двузначным номером, как у платитутки", () => {
    assert.equal(botAvatarSrc(1200), "/games/turbochess/bots/00.svg");
    assert.equal(botAvatarSrc(1203), "/games/turbochess/bots/03.svg");
  });

  it("номер ниже диапазона не уводит в минус", () => {
    assert.equal(botAvatarSrc(0), "/games/turbochess/bots/00.svg");
  });

  it("лиц пока нет, и платформа за картинкой не пойдёт", () => {
    assert.equal(BOT_COUNT, 0);
  });
});

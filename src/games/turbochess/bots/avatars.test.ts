import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CHARACTERS } from "./characters";
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

  it("лиц ровно столько, сколько характеров", () => {
    assert.equal(BOT_COUNT, CHARACTERS.length);
  });

  it("номер лица идёт по кругу: за диапазон не выходим", () => {
    assert.equal(botAvatarId(0), BOT_AVATAR_OFFSET);
    assert.equal(botAvatarId(10), BOT_AVATAR_OFFSET + 10);
    assert.equal(botAvatarId(11), BOT_AVATAR_OFFSET);
    assert.equal(
      botAvatarSrc(BOT_AVATAR_OFFSET + 11),
      botAvatarSrc(BOT_AVATAR_OFFSET),
    );
  });

  it("у каждого характера есть свой файл лица", () => {
    for (let at = 0; at < CHARACTERS.length; at++) {
      const src = botAvatarSrc(botAvatarId(at));
      const name = src.split("/").at(-1) ?? "";
      assert.equal(name, `${String(at).padStart(2, "0")}.svg`);
      assert.ok(
        existsSync(join(process.cwd(), "public", src)),
        `нет файла лица: ${src}`,
      );
    }
  });

  it("ни у одного элемента лица нет повторённых атрибутов", () => {
    // Браузер рисует SVG картинкой строгим XML-разбором: повторённый атрибут
    // для него — ошибка, и лицо не показывается вовсе. Так лицо кальянщика
    // полтора этапа было пустым местом (docs/PLAN.md, этап 15в).
    for (let at = 0; at < CHARACTERS.length; at++) {
      const src = botAvatarSrc(botAvatarId(at));
      const svg = readFileSync(join(process.cwd(), "public", src), "utf8");

      for (const tag of svg.match(/<[a-zA-Z][^>]*>/g) ?? []) {
        const names = [...tag.matchAll(/\s([a-zA-Z:-]+)="/g)].map(
          (found) => found[1],
        );
        assert.equal(new Set(names).size, names.length, `${src}: ${tag}`);
      }
    }
  });
});

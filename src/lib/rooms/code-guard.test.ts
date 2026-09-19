import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { looksLikeCode } from "./code-guard";

/**
 * Форма кода комнаты: мусор отсекается до базы и считается промахом
 * (docs/SECURITY.md, S-D1). Живые коды — шесть знаков из алфавита без
 * похожих друг на друга букв и цифр.
 */

describe("похоже ли на код комнаты", () => {
  it("живой код проходит, в любом регистре", () => {
    assert.equal(looksLikeCode("MKJYZP"), true);
    assert.equal(looksLikeCode("mkjyzp"), true);
    assert.equal(looksLikeCode("5823PG"), true);
  });

  it("не та длина — не код", () => {
    assert.equal(looksLikeCode("MKJYZ"), false);
    assert.equal(looksLikeCode("MKJYZPQ"), false);
    assert.equal(looksLikeCode(""), false);
  });

  it("знаки вне алфавита — не код", () => {
    // Ноль, единица, O и I в алфавит не входят: их путают, диктуя голосом.
    assert.equal(looksLikeCode("MKJYZ0"), false);
    assert.equal(looksLikeCode("MKJYZ1"), false);
    assert.equal(looksLikeCode("MKJYZO"), false);
    assert.equal(looksLikeCode("MKJYZI"), false);
    assert.equal(looksLikeCode("MKJ-ZP"), false);
    assert.equal(looksLikeCode("MKJ ZP"), false);
  });
});

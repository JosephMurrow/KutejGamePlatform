import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeInternalPath } from "./safe-path";

/**
 * Параметр `next`: наружу не уводит ни один вариант записи чужого адреса
 * (docs/SECURITY.md, S-B4).
 */

describe("путь для возврата", () => {
  it("свои пути проходят как есть", () => {
    assert.equal(safeInternalPath("/games"), "/games");
    assert.equal(safeInternalPath("/r/ABC123"), "/r/ABC123");
    assert.equal(safeInternalPath("/games?x=1#top"), "/games?x=1#top");
    assert.equal(safeInternalPath("/"), "/");
  });

  it("чужой домен не проходит ни в каком виде", () => {
    const attempts = [
      "//evil.com",
      "///evil.com",
      "/\\evil.com",
      "/\\/evil.com",
      "\\\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "https://evil.com",
      "http:evil.com",
      "evil.com",
      "javascript:alert(1)",
      " /games",
    ];

    for (const attempt of attempts) {
      assert.equal(safeInternalPath(attempt), null, JSON.stringify(attempt));
    }
  });

  it("закодированный слэш остаётся путём у нас, а не адресом", () => {
    // `%5C` браузер как разделитель не читает: это просто странный путь на
    // нашем сайте, получит 404.
    assert.equal(safeInternalPath("/%5Cevil.com"), "/%5Cevil.com");
    assert.equal(safeInternalPath("/%2F%2Fevil.com"), "/%2F%2Fevil.com");
  });

  it("точки схлопываются, но наружу не выводят", () => {
    assert.equal(safeInternalPath("/games/../profile"), "/profile");
    assert.equal(safeInternalPath("/../../evil.com"), "/evil.com");
  });

  it("не строка — не путь", () => {
    assert.equal(safeInternalPath(null), null);
    assert.equal(safeInternalPath(undefined), null);
    assert.equal(safeInternalPath(""), null);
    assert.equal(safeInternalPath(42), null);
  });
});

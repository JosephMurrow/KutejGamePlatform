import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatSecurityLine } from "./security-log";

/** Журнал безопасности: одна строка, метка, разбираемый хвост (S-H1). */

describe("строка журнала безопасности", () => {
  it("метка, событие и поля одной строкой", () => {
    assert.equal(
      formatSecurityLine("вход: неудача", {
        login: "anya",
        address: "10.0.0.1",
      }),
      '[безопасность] вход: неудача {"login":"anya","address":"10.0.0.1"}',
    );
  });

  it("пустые поля не пишутся", () => {
    assert.equal(
      formatSecurityLine("выход везде", { user: "u1", address: undefined }),
      '[безопасность] выход везде {"user":"u1"}',
    );
    assert.equal(formatSecurityLine("событие"), "[безопасность] событие");
  });

  it("перевод строки в поле не рвёт строку журнала", () => {
    const line = formatSecurityLine("вход: неудача", { login: "a\nb" });
    assert.equal(line.includes("\n"), false);
  });
});

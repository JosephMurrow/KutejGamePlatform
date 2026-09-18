import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LetterQuota } from "./quota";

/**
 * Квота писем: один ящик не завалить, и весь процесс не выбить за суточный
 * лимит почтовой службы (docs/SECURITY.md, S-B2).
 */

const limits = { recipient: 2, process: 5, windowMs: 1_000 };

describe("квота писем", () => {
  it("на один адрес — не больше потолка", () => {
    const quota = new LetterQuota(limits);

    assert.equal(quota.take("a@x.ru", 0), true);
    assert.equal(quota.take("a@x.ru", 1), true);
    assert.equal(quota.take("a@x.ru", 2), false);
  });

  it("адрес сравнивается без регистра и пробелов", () => {
    const quota = new LetterQuota(limits);

    quota.take("a@x.ru", 0);
    quota.take(" A@X.RU ", 1);
    assert.equal(quota.take("a@X.ru", 2), false);
  });

  it("на весь процесс — не больше общего потолка, даже на новые адреса", () => {
    const quota = new LetterQuota(limits);

    for (let i = 0; i < 5; i++) assert.equal(quota.take(`u${i}@x.ru`, i), true);
    assert.equal(quota.take("fresh@x.ru", 10), false);
  });

  it("отказ по адресу не тратит общий потолок", () => {
    const quota = new LetterQuota(limits);

    quota.take("a@x.ru", 0);
    quota.take("a@x.ru", 1);
    for (let i = 0; i < 10; i++) quota.take("a@x.ru", 2 + i);

    // Засчитано два письма из пяти — ещё три адреса пройдут.
    for (let i = 0; i < 3; i++)
      assert.equal(quota.take(`u${i}@x.ru`, 20), true);
  });

  it("окно проходит — снова можно", () => {
    const quota = new LetterQuota(limits);

    quota.take("a@x.ru", 0);
    quota.take("a@x.ru", 1);
    assert.equal(quota.take("a@x.ru", 1_002), true);
  });
});

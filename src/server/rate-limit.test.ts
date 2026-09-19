import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RateLimiter } from "./rate-limit";

/**
 * Лимитер: окно, штраф и — главное — конечная память. Ключом бывает что
 * угодно, присланное снаружи, и лимитер, который помнит всё, сам становится
 * способом уронить процесс (docs/SECURITY.md, S-R1).
 */

describe("лимитер: окно", () => {
  it("пускает до лимита и отказывает после", () => {
    const limiter = new RateLimiter(3, 1_000);

    assert.equal(limiter.allow("a", 0), true);
    assert.equal(limiter.allow("a", 10), true);
    assert.equal(limiter.allow("a", 20), true);
    assert.equal(limiter.allow("a", 30), false);
  });

  it("окно скользит: старые отметки перестают считаться", () => {
    const limiter = new RateLimiter(2, 1_000);

    limiter.allow("a", 0);
    limiter.allow("a", 500);
    assert.equal(limiter.allow("a", 900), false);
    assert.equal(limiter.allow("a", 1_001), true);
  });

  it("ключи не мешают друг другу", () => {
    const limiter = new RateLimiter(1, 1_000);

    assert.equal(limiter.allow("a", 0), true);
    assert.equal(limiter.allow("b", 0), true);
    assert.equal(limiter.allow("a", 1), false);
  });

  it("отказ не засчитывается: после окна снова пускает", () => {
    const limiter = new RateLimiter(1, 1_000);

    limiter.allow("a", 0);
    for (let at = 1; at < 1_000; at += 100) limiter.allow("a", at);
    assert.equal(limiter.allow("a", 1_001), true);
  });
});

describe("лимитер: проверка без отметки и штраф", () => {
  it("blocked не тратит лимит", () => {
    const limiter = new RateLimiter(1, 1_000);

    for (let i = 0; i < 10; i++) assert.equal(limiter.blocked("a", i), false);
    assert.equal(limiter.allow("a", 10), true);
    assert.equal(limiter.blocked("a", 11), true);
  });

  it("штраф съедает лимит быстрее", () => {
    const limiter = new RateLimiter(5, 1_000);

    limiter.hit("a", 0, 3);
    assert.equal(limiter.blocked("a", 1), false);
    limiter.hit("a", 2, 2);
    assert.equal(limiter.blocked("a", 3), true);
  });

  it("forget сбрасывает счётчик", () => {
    const limiter = new RateLimiter(1, 1_000);

    limiter.allow("a", 0);
    limiter.forget("a");
    assert.equal(limiter.allow("a", 1), true);
  });
});

describe("лимитер: память", () => {
  it("сто тысяч разовых ключей уходят уборкой", () => {
    const limiter = new RateLimiter(3, 1_000, { maxKeys: 1_000_000 });

    for (let i = 0; i < 100_000; i++) limiter.allow(`junk-${i}`, 0);
    assert.equal(limiter.size, 100_000);

    assert.equal(limiter.sweep(1_001), 100_000);
    assert.equal(limiter.size, 0);
  });

  it("уборка сама срабатывает раз в окно", () => {
    const limiter = new RateLimiter(3, 1_000);

    for (let i = 0; i < 100; i++) limiter.allow(`junk-${i}`, 0);
    limiter.allow("fresh", 5_000);

    assert.equal(limiter.size, 1);
  });

  it("уборка не трогает живые счётчики", () => {
    const limiter = new RateLimiter(2, 1_000);

    limiter.allow("old", 0);
    limiter.allow("live", 900);
    limiter.allow("live", 950);
    limiter.sweep(1_100);

    assert.equal(limiter.size, 1);
    assert.equal(limiter.allow("live", 1_100), false);
  });

  it("потолок: число ключей не растёт выше maxKeys", () => {
    const limiter = new RateLimiter(3, 60_000, { maxKeys: 100 });

    for (let i = 0; i < 10_000; i++) limiter.allow(`junk-${i}`, i);
    assert.equal(limiter.size, 100);
  });

  it("потолок выталкивает самый давно тронутый ключ", () => {
    const limiter = new RateLimiter(1, 60_000, { maxKeys: 2 });

    limiter.allow("a", 0);
    limiter.allow("b", 1);
    // «a» трогали последним — вытолкнут «b».
    limiter.hit("a", 2);
    limiter.allow("c", 3);

    assert.equal(limiter.blocked("a", 4), true);
    assert.equal(limiter.blocked("b", 4), false);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LoginGuard } from "./login-guard";

/**
 * Сторож входа: перебор пароля упирается в счётчик логина, перебор по многим
 * логинам — в счётчик адреса, а вспомнивший пароль человек не ждёт
 * (docs/SECURITY.md, S-B1).
 */

const limits = { failures: 3, attempts: 5, windowMs: 1_000 };

describe("сторож входа", () => {
  it("после N неудач на логин — отказ до проверки пароля", () => {
    const guard = new LoginGuard(limits);

    for (let i = 0; i < 3; i++) {
      assert.equal(guard.admit("anya", `10.0.0.${i}`, i), true);
      guard.failed("anya", i);
    }
    // С нового адреса тоже нельзя: считается логин, а не место.
    assert.equal(guard.admit("anya", "10.9.9.9", 10), false);
  });

  it("неудачи одного логина не трогают другой", () => {
    const guard = new LoginGuard(limits);

    for (let i = 0; i < 3; i++) guard.failed("anya", i);
    assert.equal(guard.admit("borya", "10.0.0.1", 10), true);
  });

  it("удачный вход обнуляет счётчик логина", () => {
    const guard = new LoginGuard(limits);

    guard.failed("anya", 0);
    guard.failed("anya", 1);
    guard.succeeded("anya");
    guard.failed("anya", 2);
    assert.equal(guard.admit("anya", "10.0.0.1", 3), true);
  });

  it("окно проходит — снова пускает", () => {
    const guard = new LoginGuard(limits);

    for (let i = 0; i < 3; i++) guard.failed("anya", i);
    assert.equal(guard.admit("anya", "10.0.0.1", 500), false);
    assert.equal(guard.admit("anya", "10.0.0.1", 1_010), true);
  });

  it("адрес: перебор по многим логинам упирается в потолок попыток", () => {
    const guard = new LoginGuard(limits);

    for (let i = 0; i < 5; i++) {
      assert.equal(guard.admit(`user${i}`, "10.0.0.1", i), true);
    }
    assert.equal(guard.admit("user9", "10.0.0.1", 6), false);
    // Соседний адрес живёт своей жизнью.
    assert.equal(guard.admit("user9", "10.0.0.2", 6), true);
  });

  it("отказ по логину не тратит попытки адреса", () => {
    const guard = new LoginGuard(limits);

    for (let i = 0; i < 3; i++) guard.failed("anya", i);
    for (let i = 0; i < 10; i++) guard.admit("anya", "10.0.0.1", 10 + i);
    assert.equal(guard.admit("borya", "10.0.0.1", 30), true);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { profileSchema, registerSchema } from "./validation";

/**
 * Ник игрока с аккаунтом проверяется так же, как ник гостя: раньше у него
 * проверялась только длина (docs/SECURITY.md, S-B8).
 */

const base = {
  login: "kotik",
  password: "long-enough-password",
  email: "kotik@local.test",
};

describe("ник при регистрации и в профиле", () => {
  it("обычный ник проходит и хранится в NFC без пробелов по краям", () => {
    const parsed = registerSchema.safeParse({
      ...base,
      nickname: "  Толи\u0306  ",
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data.nickname, "Толй");
  });

  it("мат не проходит — как у гостя", () => {
    assert.equal(
      registerSchema.safeParse({ ...base, nickname: "хуйло" }).success,
      false,
    );
    assert.equal(
      profileSchema.safeParse({ nickname: "мyдак", avatarId: "1" }).success,
      false,
    );
  });

  it("невидимые символы не проходят", () => {
    assert.equal(
      profileSchema.safeParse({ nickname: "Толя\u202e", avatarId: "1" })
        .success,
      false,
    );
  });

  it("длина по-прежнему проверяется", () => {
    assert.equal(
      profileSchema.safeParse({ nickname: "Я", avatarId: "1" }).success,
      false,
    );
    assert.equal(
      profileSchema.safeParse({ nickname: "Я".repeat(21), avatarId: "1" })
        .success,
      false,
    );
  });
});

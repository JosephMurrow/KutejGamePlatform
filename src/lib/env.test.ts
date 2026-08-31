import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";

/**
 * Проверка того самого случая, который иначе роняет боевой запуск: docker
 * compose подставляет пустую строку вместо переменной, которой нет в .env.
 */
function optional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema);
}

const schema = z.object({
  APP_URL: optional(z.string().url().default("http://localhost:3000")),
  MAIL_PORT: optional(z.coerce.number().int().positive().default(587)),
  MAIL_FROM: optional(
    z.string().min(1).default("Платитутка <no-reply@localhost>"),
  ),
});

describe("Окружение терпит пустые значения", () => {
  it("пустая строка равносильна отсутствию переменной", () => {
    const parsed = schema.parse({ APP_URL: "", MAIL_PORT: "", MAIL_FROM: "" });

    assert.equal(parsed.APP_URL, "http://localhost:3000");
    assert.equal(parsed.MAIL_PORT, 587);
    assert.ok(parsed.MAIL_FROM.includes("Платитутка"));
  });

  it("отсутствие переменной работает так же", () => {
    assert.equal(schema.parse({}).MAIL_PORT, 587);
  });

  it("заданное значение остаётся как есть", () => {
    const parsed = schema.parse({
      APP_URL: "https://pricetitute.duckdns.org:8443",
      MAIL_PORT: "465",
    });

    assert.equal(parsed.APP_URL, "https://pricetitute.duckdns.org:8443");
    assert.equal(parsed.MAIL_PORT, 465);
  });

  it("мусор по-прежнему отвергается", () => {
    assert.equal(schema.safeParse({ APP_URL: "не-адрес" }).success, false);
    assert.equal(schema.safeParse({ MAIL_PORT: "-1" }).success, false);
  });
});

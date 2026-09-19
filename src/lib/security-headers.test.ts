import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  commonSecurityHeaders,
  screenSecurityHeaders,
} from "./security-headers";

/** Заголовки безопасности: что обязано быть и где встраивание разрешено (S-G1). */

const value = (headers: { key: string; value: string }[], key: string) =>
  headers.find((header) => header.key === key)?.value ?? "";

describe("заголовки безопасности", () => {
  it("на всех страницах сайт нельзя встроить в чужой фрейм", () => {
    const policy = value(
      commonSecurityHeaders(false),
      "Content-Security-Policy",
    );
    assert.match(policy, /frame-ancestors 'none'/);
    assert.match(policy, /object-src 'none'/);
    assert.match(policy, /base-uri 'self'/);
    assert.match(policy, /form-action 'self'/);
    assert.match(policy, /connect-src 'self'/);
  });

  it("экран встраивать можно, остальное то же", () => {
    const policy = value(
      screenSecurityHeaders(false),
      "Content-Security-Policy",
    );
    assert.doesNotMatch(policy, /frame-ancestors/);
    assert.match(policy, /object-src 'none'/);
  });

  it("eval — только в разработке", () => {
    assert.doesNotMatch(
      value(commonSecurityHeaders(false), "Content-Security-Policy"),
      /unsafe-eval/,
    );
    assert.match(
      value(commonSecurityHeaders(true), "Content-Security-Policy"),
      /unsafe-eval/,
    );
  });

  it("остальные заголовки на месте", () => {
    const headers = commonSecurityHeaders(false);
    assert.equal(value(headers, "X-Content-Type-Options"), "nosniff");
    assert.equal(
      value(headers, "Referrer-Policy"),
      "strict-origin-when-cross-origin",
    );
    assert.match(value(headers, "Strict-Transport-Security"), /max-age=\d+/);
  });
});

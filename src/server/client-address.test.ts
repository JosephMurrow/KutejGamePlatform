import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickAddress, socketAddress, UNKNOWN_ADDRESS } from "./client-address";

/**
 * Адрес клиента за прокси. Ошибка здесь тихая и дорогая: возьмёшь не тот
 * конец цепочки — и лимит «с одного адреса» обходится одной строчкой в
 * заголовке (docs/SECURITY.md, S-R2).
 */

describe("адрес клиента", () => {
  it("за прокси — из X-Forwarded-For, а не адрес прокси", () => {
    assert.equal(pickAddress("203.0.113.7", "172.18.0.4"), "203.0.113.7");
  });

  it("цепочка: самый правый — его дописал ближайший прокси", () => {
    // Клиент вписал левое сам, Caddy дописал настоящее.
    assert.equal(
      pickAddress("6.6.6.6, 1.1.1.1, 203.0.113.7", "172.18.0.4"),
      "203.0.113.7",
    );
  });

  it("заголовок несколькими строками склеивается в одну цепочку", () => {
    assert.equal(
      pickAddress(["6.6.6.6", "203.0.113.7"], "172.18.0.4"),
      "203.0.113.7",
    );
  });

  it("пустые куски и пробелы не мешают", () => {
    assert.equal(pickAddress(" , 203.0.113.7 ,  ", undefined), "203.0.113.7");
  });

  it("без заголовка — адрес соединения", () => {
    assert.equal(pickAddress(undefined, "198.51.100.2"), "198.51.100.2");
    assert.equal(pickAddress("", "198.51.100.2"), "198.51.100.2");
  });

  it("IPv4 через IPv6-сокет — тот же адрес", () => {
    assert.equal(pickAddress(undefined, "::ffff:198.51.100.2"), "198.51.100.2");
    assert.equal(pickAddress("::FFFF:203.0.113.7", undefined), "203.0.113.7");
  });

  it("IPv6 остаётся как есть, в нижнем регистре", () => {
    assert.equal(pickAddress("2001:DB8::1", undefined), "2001:db8::1");
  });

  it("не из чего узнать — общий «неизвестный»", () => {
    assert.equal(pickAddress(undefined, undefined), UNKNOWN_ADDRESS);
    assert.equal(pickAddress(null, ""), UNKNOWN_ADDRESS);
  });

  it("сокет: заголовки рукопожатия главнее адреса соединения", () => {
    assert.equal(
      socketAddress({
        headers: { "x-forwarded-for": "203.0.113.7" },
        address: "172.18.0.4",
      }),
      "203.0.113.7",
    );
    assert.equal(socketAddress({ headers: {}, address: "::1" }), "::1");
  });
});

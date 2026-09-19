import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { originAllowed } from "./origin";

/**
 * Проверка `Origin` у сокета: чужая страница не подключается от имени
 * игрока, свой сайт — на любом адресе, под которым его открыли
 * (docs/SECURITY.md, S-E3).
 */

const APP = "https://pricetitute.duckdns.org:8443";

describe("откуда подключение", () => {
  it("свой сайт за прокси: Origin совпадает с Host", () => {
    assert.equal(
      originAllowed({ origin: APP, host: "pricetitute.duckdns.org:8443" }, APP),
      true,
    );
  });

  it("локальный сервер на любом порту", () => {
    assert.equal(
      originAllowed(
        { origin: "http://localhost:3100", host: "localhost:3100" },
        "http://localhost:3000",
      ),
      true,
    );
  });

  it("APP_URL проходит, даже если Host другой", () => {
    assert.equal(originAllowed({ origin: APP, host: "app:3000" }, APP), true);
  });

  it("хост от прокси в X-Forwarded-Host", () => {
    assert.equal(
      originAllowed(
        {
          origin: "https://kutezh.example",
          host: "app:3000",
          "x-forwarded-host": "kutezh.example",
        },
        APP,
      ),
      true,
    );
  });

  it("чужая страница — отказ", () => {
    assert.equal(
      originAllowed(
        {
          origin: "https://evil.example",
          host: "pricetitute.duckdns.org:8443",
        },
        APP,
      ),
      false,
    );
  });

  it("тот же хост, другой порт — чужой", () => {
    assert.equal(
      originAllowed(
        { origin: "http://localhost:4000", host: "localhost:3100" },
        "http://localhost:3000",
      ),
      false,
    );
  });

  it("мусор в Origin и `null` — отказ", () => {
    assert.equal(originAllowed({ origin: "null", host: "a" }, APP), false);
    assert.equal(originAllowed({ origin: "не адрес", host: "a" }, APP), false);
  });

  it("без Origin — не браузер, пропускаем", () => {
    assert.equal(originAllowed({ host: "a" }, APP), true);
    assert.equal(originAllowed({ origin: "", host: "a" }, APP), true);
  });
});

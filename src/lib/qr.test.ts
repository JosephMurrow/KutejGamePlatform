import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQr, QUIET_ZONE } from "./qr";

const LINK = "https://pricetitute.duckdns.org:8443/r/8G3P7Y";

describe("Разметка QR-кода", () => {
  it("строит непустой код", () => {
    const qr = buildQr(LINK);
    assert.ok(qr.path.length > 0, "путь пустой");
    assert.ok(qr.size > 2 * QUIET_ZONE, "поле меньше одной рамки");
  });

  it("оставляет белое поле по краям", () => {
    const { path } = buildQr(LINK);
    const points = [...path.matchAll(/M(\d+) (\d+)/g)].map(([, x, y]) => ({
      x: Number(x),
      y: Number(y),
    }));

    assert.ok(
      points.every((p) => p.x >= QUIET_ZONE && p.y >= QUIET_ZONE),
      "тёмный модуль залез в рамку",
    );
  });

  it("модули не вылезают за поле", () => {
    const { path, size } = buildQr(LINK);
    const points = [...path.matchAll(/M(\d+) (\d+)/g)].map(([, x, y]) => ({
      x: Number(x),
      y: Number(y),
    }));

    assert.ok(
      points.every((p) => p.x < size - QUIET_ZONE && p.y < size - QUIET_ZONE),
      "модуль вышел за пределы поля",
    );
  });

  it("одинаковая ссылка даёт одинаковый код", () => {
    assert.deepEqual(buildQr(LINK), buildQr(LINK));
  });

  it("разные ссылки дают разные коды", () => {
    assert.notEqual(buildQr(LINK).path, buildQr(LINK + "X").path);
  });

  it("длинная ссылка укладывается в код большего размера", () => {
    const короткий = buildQr("https://a.ru/r/AAAAAA");
    const длинный = buildQr("https://a.ru/r/" + "A".repeat(300));
    assert.ok(
      длинный.size > короткий.size,
      "размер не вырос под длинные данные",
    );
  });
});

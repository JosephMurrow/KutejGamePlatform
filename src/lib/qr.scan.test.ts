import assert from "node:assert/strict";
import { describe, it } from "node:test";
import jsQR from "jsqr";
import { buildQr, QUIET_ZONE } from "./qr";

/**
 * Проверка того единственного, ради чего код рисуется: что телефон прочитает
 * из него ту самую ссылку.
 *
 * Разбираем обратно наш собственный путь для SVG, а не внутренности
 * библиотеки, — иначе проверка была бы кольцевой и не поймала бы ни
 * перепутанные строки со столбцами, ни съеденную белую рамку.
 */

/** Сколько экранных точек на один модуль: декодеру нужен запас. */
const SCALE = 8;

function decode(link: string): string | null {
  const { size, path } = buildQr(link);
  const side = size * SCALE;

  // Белое поле, поверх которого закрашиваем тёмные модули.
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);

  for (const [, x, y] of path.matchAll(/M(\d+) (\d+)/g)) {
    const col = Number(x);
    const row = Number(y);

    for (let dy = 0; dy < SCALE; dy++) {
      for (let dx = 0; dx < SCALE; dx++) {
        const px = col * SCALE + dx;
        const py = row * SCALE + dy;
        const at = (py * side + px) * 4;
        pixels[at] = 0;
        pixels[at + 1] = 0;
        pixels[at + 2] = 0;
      }
    }
  }

  return jsQR(pixels, side, side)?.data ?? null;
}

describe("QR-код читается", () => {
  it("отдаёт ту же ссылку, что в него положили", () => {
    const link = "https://pricetitute.duckdns.org:8443/r/8G3P7Y";
    assert.equal(decode(link), link);
  });

  it("читается и локальный адрес, и внешний", () => {
    for (const link of [
      "http://localhost:3000/r/R8TGJJ",
      "https://pricetitute.duckdns.org:8443/play",
      "https://pricetitute.duckdns.org:8443/r/V6AC5F",
    ]) {
      assert.equal(decode(link), link, `не прочиталось: ${link}`);
    }
  });

  it("белая рамка на месте — иначе код бы не опознался", () => {
    // jsQR требует тихую зону: если бы мы её потеряли, разбор выше уже упал бы.
    assert.equal(QUIET_ZONE, 4);
  });
});

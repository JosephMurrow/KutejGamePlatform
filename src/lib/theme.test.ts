import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { PLATFORM_SURFACE } from "./theme";
import { GAMES } from "./games/registry";

/**
 * Цвет фона живёт в двух местах: переменной в `globals.css` и строкой в коде.
 * Второй экземпляр вынужденный — метаданные считаются на сервере, а прочитать
 * переменную CSS там нечем.
 *
 * Этот тест — единственное, что не даёт им разойтись. Разойдясь, они не
 * сломают ничего заметного: страница останется правильной, а полоса статуса в
 * установленном приложении тихо станет чужого цвета — то, что замечают через
 * месяц и не понимают, откуда взялось.
 */

const CSS = readFileSync(
  path.join(process.cwd(), "src", "app", "globals.css"),
  "utf8",
  // Комментарии выкидываем сразу: иначе фигурная скобка в тексте оборвала бы
  // разбор блока на середине.
).replace(/\/\*[\s\S]*?\*\//g, "");

/** Значение `--color-surface` в блоке с таким селектором. */
function surfaceOf(selector: string): string | null {
  const start = CSS.indexOf(`${selector} {`);
  if (start < 0) return null;

  const end = CSS.indexOf("}", start);
  const block = CSS.slice(start, end);
  return block.match(/--color-surface:\s*(#[0-9a-fA-F]{3,8})/)?.[1] ?? null;
}

describe("цвет фона в коде и в стилях", () => {
  it("у платформы совпадает", () => {
    const css = surfaceOf("@theme");
    assert.ok(css, "в globals.css не нашлось --color-surface у @theme");
    assert.equal(
      PLATFORM_SURFACE.toLowerCase(),
      css.toLowerCase(),
      "PLATFORM_SURFACE разошёлся с globals.css",
    );
  });

  it("у каждой игры совпадает", () => {
    for (const game of GAMES) {
      const css = surfaceOf(`[data-game="${game.id}"]`);
      assert.ok(css, `у темы ${game.id} не нашлось --color-surface`);
      assert.equal(
        game.themeColor.toLowerCase(),
        css.toLowerCase(),
        `themeColor у ${game.id} разошёлся с globals.css`,
      );
    }
  });

  /**
   * Тема игры обязана перебивать платформенную, иначе цвет шапки внутри игры
   * останется фиолетовым, а страница будет светлой.
   */
  it("тема игры не совпадает с платформенной", () => {
    for (const game of GAMES) {
      assert.notEqual(
        game.themeColor.toLowerCase(),
        PLATFORM_SURFACE.toLowerCase(),
        `${game.id} красится как платформа — тема не перебивает`,
      );
    }
  });
});

describe("отступ в установленном приложении", () => {
  /**
   * Нижний отступ `pb-16` лечит нижнюю строку адреса андроидных браузеров.
   * В приложении её нет, и отступ превращается в пустоту (docs/BACKLOG.md B1).
   */
  it("правило для standalone на месте", () => {
    assert.match(CSS, /@media\s*\(display-mode:\s*standalone\)/);
  });

  it("отступ снизу считается от безопасной зоны", () => {
    const start = CSS.indexOf("@media (display-mode: standalone)");
    const block = CSS.slice(
      start,
      CSS.indexOf("}", CSS.indexOf("}", start) + 1),
    );
    assert.match(block, /padding-bottom:\s*env\(safe-area-inset-bottom\)/);
  });
});

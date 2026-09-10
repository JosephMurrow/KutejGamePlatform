import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COVER_IN_STANDALONE } from "./standalone";

/**
 * Скрипт, включающий полноэкранную раскладку в приложении
 * (docs/BACKLOG.md B2).
 *
 * Проверяется не текст строки, а поведение: строка прогоняется на поддельных
 * `window` и `document` — она обращается к ним только через эти два имени, и
 * подсунуть их можно параметрами функции.
 *
 * Главная проверка здесь одна: **во вкладке браузера скрипт не делает
 * ничего**. Хозяин просил не трогать вёрстку веба, приложение поставят не все,
 * и `viewport-fit=cover` во вкладке Safari меняет раскладку в альбомной
 * ориентации. Остальные проверки — про то, что в приложении он всё-таки
 * срабатывает.
 */

const БАЗОВЫЙ =
  "width=device-width, initial-scale=1, interactive-widget=resizes-content";

function прогнать(режим: {
  displayMode?: boolean;
  navigatorStandalone?: boolean;
  content?: string;
  безМеты?: boolean;
}): string {
  const meta = { content: режим.content ?? БАЗОВЫЙ };

  const window = {
    matchMedia: (запрос: string) => ({
      matches: запрос.includes("standalone") && режим.displayMode === true,
    }),
    navigator: { standalone: режим.navigatorStandalone },
  };
  const document = {
    querySelector: () => (режим.безМеты ? null : meta),
  };

  new Function("window", "document", COVER_IN_STANDALONE)(window, document);
  return meta.content;
}

describe("полноэкранная раскладка в приложении", () => {
  it("во вкладке браузера не трогает вьюпорт", () => {
    assert.equal(прогнать({}), БАЗОВЫЙ);
  });

  it("в приложении дописывает viewport-fit", () => {
    assert.equal(
      прогнать({ displayMode: true }),
      `${БАЗОВЫЙ}, viewport-fit=cover`,
    );
  });

  /** На айфоне `display-mode` поддержан не везде, а этот признак есть всегда. */
  it("узнаёт приложение и по признаку Safari", () => {
    assert.equal(
      прогнать({ navigatorStandalone: true }),
      `${БАЗОВЫЙ}, viewport-fit=cover`,
    );
  });

  it("не дописывает второй раз", () => {
    const уже = `${БАЗОВЫЙ}, viewport-fit=cover`;
    assert.equal(прогнать({ displayMode: true, content: уже }), уже);
  });

  it("молчит, если мета-тега нет вовсе", () => {
    assert.doesNotThrow(() => прогнать({ displayMode: true, безМеты: true }));
  });

  /** Старый браузер без `matchMedia` не должен ронять страницу. */
  it("молчит на браузере без matchMedia", () => {
    const meta = { content: БАЗОВЫЙ };
    assert.doesNotThrow(() => {
      new Function("window", "document", COVER_IN_STANDALONE)(
        {},
        { querySelector: () => meta },
      );
    });
    assert.equal(meta.content, БАЗОВЫЙ);
  });
});

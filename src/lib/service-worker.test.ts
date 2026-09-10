import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/**
 * Служебный воркер `public/sw.js` (docs/BACKLOG.md D1).
 *
 * Он стоит между страницей и сетью, и цена ошибки здесь несимметричная:
 * лишний перехваченный запрос — это партия, которая разваливается через раз и
 * не воспроизводится никогда. Поэтому проверяется не то, что воркер что-то
 * делает, а прежде всего то, чего он **не** делает.
 *
 * Файл прогоняется целиком с поддельными глобалями: он обращается только к
 * `self`, `caches` и `Response`, и подсунуть их можно параметрами функции.
 */

const ИСХОДНИК = readFileSync(
  path.join(process.cwd(), "public", "sw.js"),
  "utf8",
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Слушатели = Record<string, (event: any) => void>;

/** Загрузить воркер и собрать его обработчики. */
function загрузить(): { слушатели: Слушатели; положеноВКеш: string[] } {
  const слушатели: Слушатели = {};
  const положеноВКеш: string[] = [];

  const self = {
    addEventListener: (тип: string, слушатель: (event: unknown) => void) => {
      слушатели[тип] = слушатель;
    },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
    registration: { navigationPreload: { enable: async () => {} } },
  };

  const caches = {
    open: async () => ({
      add: async (request: { url: string }) => {
        положеноВКеш.push(request.url);
      },
      match: async () => ({ офлайн: true }),
    }),
    keys: async () => [],
    delete: async () => true,
  };

  const Request = class {
    url: string;
    constructor(url: string) {
      this.url = url;
    }
  };

  new Function("self", "caches", "Request", "Response", ИСХОДНИК)(
    self,
    caches,
    Request,
    { error: () => ({ ошибка: true }) },
  );

  return { слушатели, положеноВКеш };
}

/** Событие запроса: запоминает, взялся ли воркер отвечать. */
function запрос(url: string, mode: string) {
  let ответ: unknown = null;
  let перехвачен = false;

  return {
    event: {
      request: { url, mode },
      preloadResponse: Promise.resolve(undefined),
      respondWith: (value: unknown) => {
        перехвачен = true;
        ответ = value;
      },
      waitUntil: () => {},
    },
    перехвачен: () => перехвачен,
    ответ: () => ответ,
  };
}

describe("служебный воркер", () => {
  const { слушатели, положеноВКеш } = загрузить();

  it("подписывается на установку, включение и запросы", () => {
    assert.deepEqual(Object.keys(слушатели).sort(), [
      "activate",
      "fetch",
      "install",
    ]);
  });

  it("кладёт в кеш только страницу «нет сети»", async () => {
    // `install` асинхронный: работа уезжает в `waitUntil`, и дождаться её
    // надо так же, как это делает браузер.
    const работа: Promise<unknown>[] = [];
    слушатели.install?.({ waitUntil: (p: Promise<unknown>) => работа.push(p) });
    await Promise.all(работа);

    assert.deepEqual(положеноВКеш, ["/offline"]);
  });
});

describe("что воркер обязан пропускать мимо", () => {
  const { слушатели } = загрузить();

  function пропускает(url: string, mode: string) {
    const q = запрос(url, mode);
    слушатели.fetch?.(q.event);
    return !q.перехвачен();
  }

  /**
   * Главная мина. Вебсокет мимо воркера проходит сам, но socket.io начинает не
   * с вебсокета, а с обычного HTTP-опроса — и вот его воркер увидел бы.
   */
  it("рукопожатие socket.io", () => {
    assert.ok(
      пропускает(
        "https://example.com/socket.io/?EIO=4&transport=polling",
        "cors",
      ),
    );
    assert.ok(
      пропускает("https://example.com/socket.io/?EIO=4", "navigate"),
      "даже если браузер назовёт это переходом",
    );
  });

  it("полезную нагрузку RSC и прочие запросы страницы", () => {
    assert.ok(пропускает("https://example.com/games?_rsc=abc12", "cors"));
    assert.ok(
      пропускает("https://example.com/_next/static/chunk.js", "no-cors"),
    );
  });

  it("действия сервера", () => {
    assert.ok(пропускает("https://example.com/games/pricetitute/play", "cors"));
  });

  it("страницы с сессией — их отдаёт сервер, а не кеш", () => {
    assert.ok(пропускает("https://example.com/profile", "cors"));
    assert.ok(пропускает("https://example.com/r/ABCDE", "cors"));
  });
});

describe("что воркер берёт на себя", () => {
  const { слушатели } = загрузить();

  it("переход по адресу — чтобы было чем ответить без сети", () => {
    const q = запрос("https://example.com/games", "navigate");
    слушатели.fetch?.(q.event);
    assert.ok(q.перехвачен());
  });
});

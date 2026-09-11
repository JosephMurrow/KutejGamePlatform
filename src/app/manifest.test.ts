import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import manifest from "./manifest";
import nextConfig from "../../next.config";
import { GAMES } from "@/lib/games/registry";

/**
 * Манифест приложения (docs/BACKLOG.md A1).
 *
 * Глазами он не проверяется: браузер молча не предложит установку, и понять
 * почему можно только через инструменты разработчика на телефоне. Поэтому
 * здесь проверено всё, на чём эта штука обычно и ломается.
 */

const PUBLIC = path.join(process.cwd(), "public");

/** Ширина и высота PNG лежат в IHDR — первом куске сразу после сигнатуры. */
function png(file: string) {
  const bytes = readFileSync(path.join(PUBLIC, file.replace(/^\/+/, "")));
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    /** 0 и 2 — без альфа-канала, 4 и 6 — с ним. */
    hasAlpha: bytes[25] === 4 || bytes[25] === 6,
  };
}

describe("манифест приложения", () => {
  const app = manifest();

  it("объявляет себя приложением, а не сайтом", () => {
    assert.equal(app.display, "standalone");
    assert.equal(app.scope, "/");
    assert.ok(app.name);
    assert.ok(app.short_name);
    assert.ok(app.description);
  });

  /**
   * Без `id` приложение опознаётся по `start_url`, и смена стартовой страницы
   * читается браузером как другое приложение: у поставивших остаётся жить
   * старое, а новое ставится вторым. Чинится только просьбой переустановить.
   */
  it("держит опознавательный признак отдельно от стартовой страницы", () => {
    assert.equal(app.id, "/");
  });

  /**
   * Запуск с домашнего экрана не имеет права начинаться с редиректа: это
   * лишний поход в сеть ровно тогда, когда человек смотрит на пустой экран.
   * Список редиректов берётся из настоящего конфига, а не переписывается сюда.
   */
  it("стартовая страница не редиректит", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    const sources = redirects.map((rule) => rule.source);

    assert.ok(app.start_url, "стартовая страница не задана");
    assert.ok(
      !sources.includes(app.start_url),
      `${app.start_url} значится редиректом на ${
        redirects.find((rule) => rule.source === app.start_url)?.destination
      }`,
    );
    assert.notEqual(
      app.start_url,
      "/",
      "корень отвечает редиректом на витрину",
    );
  });

  it("стартовая страница лежит внутри скоупа", () => {
    assert.ok(app.start_url?.startsWith(app.scope ?? "/"));
  });
});

describe("иконки манифеста", () => {
  const icons = manifest().icons ?? [];
  const size = (icon: (typeof icons)[number]) => icon.sizes;
  const kind = (icon: (typeof icons)[number]) => icon.purpose ?? "any";

  /** Без обоих размеров андроид установку не предложит вовсе. */
  it("есть 192 и 512 и обычные, и под маску", () => {
    for (const purpose of ["any", "maskable"]) {
      const mine = icons.filter((icon) => kind(icon) === purpose);
      assert.deepEqual(
        mine.map(size).sort(),
        ["192x192", "512x512"],
        `не хватает размеров для ${purpose}`,
      );
    }
  });

  /**
   * Соблазн написать `purpose: "any maskable"` одной записью есть, и так
   * делают. Тогда андроид рисует иконку с запасом по краям как обычную, и
   * она выглядит мелкой и потерянной среди соседей.
   */
  it("обычные и маскируемые объявлены порознь", () => {
    for (const icon of icons) {
      assert.ok(
        !String(kind(icon)).includes(" "),
        `совмещённое назначение у ${icon.src}`,
      );
    }
  });

  it("файлы лежат на месте и того размера, что обещан", () => {
    for (const icon of icons) {
      const file = png(icon.src);
      assert.equal(
        `${file.width}x${file.height}`,
        icon.sizes,
        `${icon.src} обещает ${icon.sizes}, а на деле ${file.width}x${file.height}`,
      );
    }
  });

  /**
   * Маска андроида срезает углы, а прозрачность под ней подкладывается чёрным.
   * Проверяется форматом: у этих файлов альфа-канала нет вовсе, и завестись
   * прозрачности физически негде.
   */
  it("маскируемые непрозрачны по самому формату файла", () => {
    for (const icon of icons.filter((i) => kind(i) === "maskable")) {
      assert.equal(
        png(icon.src).hasAlpha,
        false,
        `${icon.src} с альфа-каналом`,
      );
    }
  });
});

describe("ярлыки манифеста", () => {
  const shortcuts = manifest().shortcuts ?? [];

  it("по ярлыку на каждую игру из реестра", () => {
    assert.equal(shortcuts.length, GAMES.length);
    assert.deepEqual(
      shortcuts.map((s) => s.url).sort(),
      GAMES.map((game) => game.routes.home).sort(),
    );
  });

  it("иконки ярлыков лежат на месте", () => {
    for (const shortcut of shortcuts) {
      for (const icon of shortcut.icons ?? []) {
        const file = png(icon.src);
        assert.equal(`${file.width}x${file.height}`, icon.sizes, icon.src);
      }
    }
  });
});

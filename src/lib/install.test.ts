import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  installWay,
  isIOS,
  isStandalone,
  MIN_VISITS,
  shouldOffer,
  snoozeUntil,
  SNOOZE_DAYS,
  type Browser,
} from "./install";

/**
 * Подсказка про установку (docs/BACKLOG.md E1).
 *
 * Ошибиться здесь можно в две стороны, и обе плохи: показать инструкцию не
 * тому телефону — сказать неправду, показать её слишком часто — надоесть.
 * Поэтому проверяются и выбор пути, и правило показа.
 */

function браузер(userAgent: string, доп: Partial<Browser> = {}): Browser {
  return { userAgent, maxTouchPoints: 0, platform: "", ...доп };
}

const АЙФОН_SAFARI = браузер(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
);
const АЙФОН_CHROME = браузер(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0 Mobile/15E148 Safari/604.1",
);
const АНДРОИД = браузер(
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Mobile Safari/537.36",
);
const МАК = браузер(
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  { platform: "MacIntel" },
);
const АЙПАД = браузер(
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  { platform: "MacIntel", maxTouchPoints: 5 },
);

describe("какой телефон", () => {
  it("айфон в Safari — можно показать инструкцию", () => {
    assert.equal(installWay(АЙФОН_SAFARI), "ios-safari");
  });

  /**
   * На айфоне не в Safari поставить нельзя вовсе. Показать там инструкцию про
   * «Поделиться» — соврать: пункта «На экран Домой» в этих браузерах нет.
   */
  it("айфон не в Safari — отдельный случай", () => {
    assert.equal(installWay(АЙФОН_CHROME), "ios-other");
    for (const метка of ["FxiOS/125.0", "EdgiOS/122.0", "YaBrowser/24.1"]) {
      assert.equal(
        installWay(
          браузер(`Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) ${метка}`),
        ),
        "ios-other",
        метка,
      );
    }
  });

  it("андроид", () => {
    assert.equal(installWay(АНДРОИД), "android");
  });

  it("десктоп", () => {
    assert.equal(installWay(МАК), "desktop");
  });

  /**
   * Поймано живой проверкой. Мобильный режим в инструментах разработчика
   * подменяет агент, но `navigator.platform` оставляет маковский, а число
   * касаний ставит пять — и догадка про айпад выигрывала у явного признака.
   * Человеку с андроидом показывали инструкцию для айфона.
   */
  it("андроид с тачем и маковской платформой — всё равно андроид", () => {
    const ряженый = браузер(АНДРОИД.userAgent, {
      platform: "MacIntel",
      maxTouchPoints: 5,
    });
    assert.equal(isIOS(ряженый), false);
    assert.equal(installWay(ряженый), "android");
  });

  /** iPadOS 13+ представляется маком: отличает только тач. */
  it("айпад узнаётся по тачу, а не по агенту", () => {
    assert.equal(isIOS(МАК), false, "мак без тача — не айфон");
    assert.equal(isIOS(АЙПАД), true);
    assert.equal(installWay(АЙПАД), "ios-safari");
  });
});

describe("уже установлено", () => {
  it("узнаётся по стандартному признаку", () => {
    assert.equal(isStandalone(true), true);
  });

  /** На айфоне `display-mode` поддержан не везде — там свой признак. */
  it("узнаётся и по признаку Safari", () => {
    assert.equal(isStandalone(false, true), true);
  });

  it("во вкладке — нет", () => {
    assert.equal(isStandalone(false), false);
    assert.equal(isStandalone(false, false), false);
  });
});

describe("пора ли предлагать", () => {
  const ТЕПЕРЬ = 1_800_000_000_000;
  const основа = {
    standalone: false,
    visits: MIN_VISITS,
    dismissedUntil: 0,
    now: ТЕПЕРЬ,
  };

  it("на втором заходе — да", () => {
    assert.equal(shouldOffer(основа), true);
  });

  it("на первом заходе — нет", () => {
    assert.equal(shouldOffer({ ...основа, visits: 1 }), false);
  });

  /** Установившему предлагать установку — верный способ выглядеть глупо. */
  it("установившему — никогда", () => {
    assert.equal(shouldOffer({ ...основа, standalone: true }), false);
    assert.equal(
      shouldOffer({ ...основа, standalone: true, visits: 99 }),
      false,
    );
  });

  it("после отказа молчим до срока", () => {
    const молчим = { ...основа, dismissedUntil: snoozeUntil(ТЕПЕРЬ) };
    assert.equal(shouldOffer(молчим), false);
    assert.equal(shouldOffer({ ...молчим, now: ТЕПЕРЬ + 1000 }), false);
  });

  it("после срока предлагаем снова", () => {
    const срок = snoozeUntil(ТЕПЕРЬ);
    assert.equal(
      shouldOffer({ ...основа, dismissedUntil: срок, now: срок + 1 }),
      true,
    );
  });

  it("срок молчания — две недели", () => {
    assert.equal(
      snoozeUntil(ТЕПЕРЬ) - ТЕПЕРЬ,
      SNOOZE_DAYS * 24 * 60 * 60 * 1000,
    );
  });
});

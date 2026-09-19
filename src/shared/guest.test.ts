import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkNickname,
  GUEST_NICKNAME_MAX,
  hasHiddenChars,
  nicknameLooksBad,
  normalizeNickname,
} from "./guest";

/**
 * Ник гостя — это то, что стример покажет в эфире, поэтому фильтр здесь
 * намеренно грубый: он отсекает ленивых, а не решает задачу целиком
 * (см. src/games/pricetitute/docs/BACKLOG.md O4).
 */

describe("фильтр ников", () => {
  it("обычные ники проходят", () => {
    for (const nickname of ["Толя", "kotik", "Иван Петрович", "xX_Ded_Xx"]) {
      assert.equal(nicknameLooksBad(nickname), false, nickname);
    }
  });

  it("явная брань не проходит", () => {
    for (const nickname of ["хуйло", "Пиздец", "еблан228", "БЛЯДИНА"]) {
      assert.equal(nicknameLooksBad(nickname), true, nickname);
    }
  });

  it("подмена букв цифрами и латиницей не спасает", () => {
    for (const nickname of ["ху1", "п1здец", "xyйло", "мyдак", "6лядь"]) {
      assert.equal(nicknameLooksBad(nickname), true, nickname);
    }
  });

  it("фильтр обходится и это известно", () => {
    // Звёздочка вместо буквы разрывает слово, и список его уже не узнаёт.
    // Полного решения тут не бывает: остальное ловится кнопкой «выгнать».
    assert.equal(nicknameLooksBad("п*здец"), false);
  });

  it("самозванцы под администрацию не проходят", () => {
    assert.equal(nicknameLooksBad("Админ"), true);
    assert.equal(nicknameLooksBad("Модератор"), true);
    assert.equal(nicknameLooksBad("Модница"), false, "ложных срабатываний нет");
  });
});

describe("проверка ника перед заведением гостя", () => {
  it("короткий отбивается", () => {
    assert.match(String(checkNickname("я")), /короче/);
  });

  it("длинный отбивается", () => {
    assert.match(String(checkNickname("я".repeat(50))), /длиннее/);
  });

  it("ровно по границе проходит", () => {
    assert.equal(checkNickname("я".repeat(GUEST_NICKNAME_MAX)), null);
  });

  it("пробелы по краям не считаются длиной", () => {
    assert.equal(checkNickname("  Толя  "), null);
  });

  it("годный ник проходит", () => {
    assert.equal(checkNickname("Толя"), null);
  });
});

describe("невидимые символы в нике (docs/SECURITY.md, S-B8)", () => {
  it("нуль ширины прячет мат — не проходит", () => {
    assert.notEqual(checkNickname("ху\u200bйло"), null);
    assert.notEqual(checkNickname("Толя\u200b"), null);
  });

  it("смена направления текста — не проходит", () => {
    for (const mark of ["\u202e", "\u202d", "\u2066", "\u200f", "\u061c"]) {
      assert.notEqual(
        checkNickname(`Толя${mark}ялоТ`),
        null,
        mark.codePointAt(0)?.toString(16),
      );
    }
  });

  it("управляющие коды и перевод строки — не проходят", () => {
    const bad = ["Толя\u0000", "То\nля", "То\tля", "Толя\u007f", "То\u2028ля"];
    for (const nickname of bad) {
      assert.notEqual(checkNickname(nickname), null, JSON.stringify(nickname));
    }
  });

  it("составные эмодзи через ZWJ проходят", () => {
    const family = "\u{1f468}\u200d\u{1f469}\u200d\u{1f467}";
    assert.equal(checkNickname(`Семья ${family}`), null);
    assert.equal(hasHiddenChars("\u{1f44d}\u{1f3fd} Толя"), false);
  });

  it("NFC: «й» из двух кодовых точек и из одной — один ник", () => {
    const composed = "Толй";
    const decomposed = "Толи\u0306";
    assert.notEqual(composed, decomposed);
    assert.equal(normalizeNickname(decomposed), composed);
  });
});

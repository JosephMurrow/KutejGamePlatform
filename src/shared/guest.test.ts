import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkNickname, GUEST_NICKNAME_MAX, nicknameLooksBad } from "./guest";

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

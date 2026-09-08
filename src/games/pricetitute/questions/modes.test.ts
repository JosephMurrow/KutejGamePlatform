import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adultChoiceApplies,
  isHardcore,
  PACKS_BY_MODE,
  parseMode,
  QUESTION_MODES,
} from "./modes";

describe("Режимы вопросов", () => {
  it("обычный режим — это только стандарт", () => {
    assert.deepEqual(PACKS_BY_MODE.normal, ["STANDARD"]);
  });

  it("пьяная компания добавляет три пака к стандарту", () => {
    assert.deepEqual(PACKS_BY_MODE.drunk_party, [
      "STANDARD",
      "DRUNK",
      "SEX",
      "CRIME",
    ]);
  });

  it("в жёстком режиме стандарта нет", () => {
    assert.equal(PACKS_BY_MODE.hardcore.includes("STANDARD"), false);
  });

  it("чернота есть ровно в одном режиме", () => {
    const withBlack = QUESTION_MODES.filter((mode) =>
      PACKS_BY_MODE[mode].includes("BLACK"),
    );

    assert.deepEqual(withBlack, ["hardcore"]);
    assert.equal(isHardcore("hardcore"), true);
    assert.equal(isHardcore("drunk_party"), false);
    assert.equal(isHardcore("normal"), false);
  });

  it("галочка 18+ имеет смысл только в обычном режиме", () => {
    assert.equal(adultChoiceApplies("normal"), true);
    assert.equal(adultChoiceApplies("drunk_party"), false);
    assert.equal(adultChoiceApplies("hardcore"), false);
  });

  it("ни один пак не потерялся между режимами", () => {
    const covered = new Set(
      QUESTION_MODES.flatMap((m) => [...PACKS_BY_MODE[m]]),
    );

    assert.deepEqual([...covered].sort(), [
      "BLACK",
      "CRIME",
      "DRUNK",
      "SEX",
      "STANDARD",
    ]);
  });

  it("разбирает режим и из формы, и из базы", () => {
    assert.equal(parseMode("hardcore"), "hardcore");
    assert.equal(parseMode("HARDCORE"), "hardcore");
    assert.equal(parseMode("DRUNK_PARTY"), "drunk_party");
  });

  it("на мусор отдаёт обычный режим, а не падает", () => {
    assert.equal(parseMode("совсем-жёстко-пожалуйста"), "normal");
    assert.equal(parseMode(undefined), "normal");
    assert.equal(parseMode(null), "normal");
  });
});

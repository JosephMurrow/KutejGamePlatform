import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MODES } from "../modes/catalog";
import {
  defaultRoomSettings,
  normalizeRoomSettings,
  readOptions,
} from "./settings";

describe("настройки комнаты", () => {
  it("принимают любой режим из каталога", () => {
    for (const { id } of MODES) {
      assert.equal(normalizeRoomSettings({ mode: id }).mode, id);
    }
  });

  it("на мусоре из формы откатываются к умолчанию", () => {
    for (const junk of [null, undefined, "", "one_kind", "HACK", 7, {}]) {
      assert.deepEqual(normalizeRoomSettings({ mode: junk }), {
        mode: defaultRoomSettings().mode,
        options: {},
      });
    }
  });

  it("ручки из базы берут только простые значения", () => {
    assert.deepEqual(
      readOptions({
        kind: "QUEEN",
        threshold: 25,
        blind: true,
        nested: { a: 1 },
        list: [1, 2],
        nothing: null,
        infinite: Number.POSITIVE_INFINITY,
      }),
      { kind: "QUEEN", threshold: 25, blind: true },
    );
  });

  it("ручки не из объекта становятся пустыми", () => {
    for (const raw of [null, "{}", 42, [1, 2], undefined]) {
      assert.deepEqual(readOptions(raw), {});
    }
  });
});

describe("каталог режимов", () => {
  it("номера идут подряд с единицы — по ним ссылается MODES.md", () => {
    assert.deepEqual(
      MODES.map((mode) => mode.number),
      MODES.map((_, at) => at + 1),
    );
  });

  it("четверо садятся только в королевской битве", () => {
    for (const mode of MODES) {
      assert.equal(mode.seats, mode.id === "BATTLE_ROYALE" ? 4 : 2, mode.id);
    }
  });
});

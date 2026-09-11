import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MODES, PLAYER_MODES } from "../modes/catalog";
import {
  defaultRoomSettings,
  normalizeRoomSettings,
  readOptions,
} from "./settings";

describe("настройки комнаты", () => {
  it("принимают любой режим, который видят игроки, и любой контроль времени", () => {
    for (const { id } of PLAYER_MODES) {
      assert.equal(
        normalizeRoomSettings({ mode: id, timeControl: "MIN_3" }).mode,
        id,
      );
    }
    assert.equal(
      normalizeRoomSettings({ mode: "MEGA", timeControl: "UNLIMITED" })
        .timeControl,
      "UNLIMITED",
    );
  });

  it("служебную «Классику» формой не выбрать, даже прислав её руками", () => {
    assert.equal(
      normalizeRoomSettings({ mode: "CLASSIC", timeControl: "SEC_30" }).mode,
      defaultRoomSettings().mode,
    );
  });

  it("на мусоре из формы откатываются к умолчанию", () => {
    for (const junk of [null, undefined, "", "one_kind", "HACK", 7, {}]) {
      assert.deepEqual(
        normalizeRoomSettings({ mode: junk, timeControl: junk }),
        defaultRoomSettings(),
      );
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
  it("номера режимов игроков идут подряд с единицы — по ним ссылается MODES.md", () => {
    assert.deepEqual(
      PLAYER_MODES.map((mode) => mode.number),
      PLAYER_MODES.map((_, at) => at + 1),
    );
  });

  it("скрыт ровно один режим — «Классика»", () => {
    assert.deepEqual(
      MODES.filter((mode) => mode.hidden).map((mode) => mode.id),
      ["CLASSIC"],
    );
  });

  it("четверо садятся только в королевской битве", () => {
    for (const mode of MODES) {
      assert.equal(mode.seats, mode.id === "BATTLE_ROYALE" ? 4 : 2, mode.id);
    }
  });
});

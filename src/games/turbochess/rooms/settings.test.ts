import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MODES, PLAYER_MODES } from "../modes/catalog";
import {
  botRoom,
  defaultRoomSettings,
  normalizeRoomSettings,
  pickBots,
  pickLevel,
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

  it("ручки режима читает сам режим, чужие ручки выбрасываются", () => {
    const field = (name: string) =>
      name === "oneKind" ? "n" : name === "threshold" ? "30" : "мусор";

    assert.deepEqual(
      normalizeRoomSettings({ mode: "ONE_KIND", timeControl: "SEC_30", field })
        .options,
      { kind: "n" },
    );
    assert.deepEqual(
      normalizeRoomSettings({ mode: "NUCLEAR", timeControl: "SEC_30", field })
        .options,
      { threshold: 30 },
      "у ядерных своя ручка, и чужой вид фигур ей не достаётся",
    );
    assert.deepEqual(
      normalizeRoomSettings({ mode: "MEGA", timeControl: "SEC_30", field })
        .options,
      {},
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

describe("соперник-программа в настройках", () => {
  it("по умолчанию за столом ждут живых", () => {
    const defaults = defaultRoomSettings();

    assert.equal(defaults.bots, 0);
    assert.equal(defaults.botLevel, "normal");
  });

  it("мест под программу на одно меньше, чем за столом: одно всегда человеку", () => {
    assert.equal(botRoom("CLASSIC"), 1);
    assert.equal(botRoom("BATTLE_ROYALE"), 3);
  });

  it("больше, чем есть мест, не просят: лишнее срезается", () => {
    assert.equal(pickBots(3, "CLASSIC"), 1);
    assert.equal(pickBots(3, "BATTLE_ROYALE"), 3);
    assert.equal(pickBots(9, "BATTLE_ROYALE"), 3);
  });

  it("мусор из формы — это ноль программ, а не падение", () => {
    assert.equal(pickBots("два", "CLASSIC"), 0);
    assert.equal(pickBots(-1, "CLASSIC"), 0);
    assert.equal(pickBots(null, "CLASSIC"), 0);
    assert.equal(pickBots("1", "CLASSIC"), 1);
  });

  it("незнакомый уровень — «Нормальный»", () => {
    assert.equal(pickLevel("expert"), "expert");
    assert.equal(pickLevel("магнус"), "normal");
    assert.equal(pickLevel(undefined), "normal");
  });

  it("форма отдаёт и соперника: сколько программ и какого уровня", () => {
    const settings = normalizeRoomSettings({
      mode: "BATTLE_ROYALE",
      timeControl: "MIN_1",
      bots: "2",
      botLevel: "hard",
    });

    assert.equal(settings.bots, 2);
    assert.equal(settings.botLevel, "hard");
  });
});

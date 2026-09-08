import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeChannel, twitchLogin, twitchNickname } from "./twitch";

describe("имя канала", () => {
  it("приводится к нижнему регистру", () => {
    assert.equal(normalizeChannel("ToLyA"), "tolya");
  });

  it("решётка и ссылка отбрасываются", () => {
    assert.equal(normalizeChannel("#tolya"), "tolya");
    assert.equal(normalizeChannel("https://twitch.tv/tolya"), "tolya");
    assert.equal(
      normalizeChannel("https://www.twitch.tv/tolya/about"),
      "tolya",
    );
  });

  it("мусор отбрасывается", () => {
    assert.equal(normalizeChannel("то ля"), null);
    assert.equal(normalizeChannel("ab"), null);
    assert.equal(normalizeChannel(""), null);
  });
});

describe("личность зрителя", () => {
  it("ник берётся из display-name, а без него — из логина", () => {
    assert.equal(twitchNickname("ToLyA", "tolya"), "ToLyA");
    assert.equal(twitchNickname(undefined, "tolya"), "tolya");
    assert.equal(twitchNickname("   ", "tolya"), "tolya");
  });

  it("логин гостя стабилен и не зависит от ника", () => {
    assert.equal(twitchLogin("12345"), "twitch_12345");
  });
});

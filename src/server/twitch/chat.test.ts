import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseIrcLine, toMessage } from "./chat";

/**
 * Разбор строк IRC. Формат простой и стабильный, но теги приезжают
 * экранированными, а последний параметр умеет содержать пробелы — на этих двух
 * местах и ломаются самодельные разборщики.
 */

const PRIVMSG =
  "@badge-info=;badges=moderator/1;color=#FF0000;display-name=Толя;" +
  "mod=1;user-id=12345 :tolya!tolya@tolya.tmi.twitch.tv PRIVMSG #stream :!10000 ставлю";

describe("строка IRC", () => {
  it("теги, отправитель и текст", () => {
    const line = parseIrcLine(PRIVMSG);
    assert.ok(line);
    assert.equal(line.command, "PRIVMSG");
    assert.equal(line.tags.get("user-id"), "12345");
    assert.equal(line.tags.get("display-name"), "Толя");
    assert.equal(line.params[0], "#stream");
    assert.equal(line.params[1], "!10000 ставлю");
  });

  it("экранирование в тегах разворачивается", () => {
    const line = parseIrcLine(
      "@display-name=Толя\\sВеликий :t!t@t PRIVMSG #s :привет",
    );
    assert.equal(line?.tags.get("display-name"), "Толя Великий");
  });

  it("строка без тегов", () => {
    const line = parseIrcLine(":tmi.twitch.tv 001 justinfan1 :Welcome");
    assert.equal(line?.command, "001");
    assert.equal(line?.params[1], "Welcome");
  });

  it("PING разбирается", () => {
    const line = parseIrcLine("PING :tmi.twitch.tv");
    assert.equal(line?.command, "PING");
    assert.equal(line?.params[0], "tmi.twitch.tv");
  });

  it("пустая строка — ничего", () => {
    assert.equal(parseIrcLine(""), null);
    assert.equal(parseIrcLine("   "), null);
  });
});

describe("сообщение зрителя", () => {
  it("собирается из PRIVMSG", () => {
    const line = parseIrcLine(PRIVMSG);
    assert.ok(line);

    const message = toMessage(line);
    assert.deepEqual(message, {
      userId: "12345",
      login: "tolya",
      displayName: "Толя",
      text: "!10000 ставлю",
      privileged: true,
    });
  });

  it("обычный зритель без привилегий", () => {
    const line = parseIrcLine(
      "@badges=;mod=0;user-id=777 :vasya!v@v PRIVMSG #s :!никогда",
    );
    assert.ok(line);
    assert.equal(toMessage(line)?.privileged, false);
  });

  it("стример считается привилегированным", () => {
    const line = parseIrcLine(
      "@badges=broadcaster/1;mod=0;user-id=1 :s!s@s PRIVMSG #s :!топ",
    );
    assert.ok(line);
    assert.equal(toMessage(line)?.privileged, true);
  });

  it("не PRIVMSG — не сообщение", () => {
    const line = parseIrcLine("PING :tmi.twitch.tv");
    assert.ok(line);
    assert.equal(toMessage(line), null);
  });

  it("без user-id сообщение не берём: личность держится на нём", () => {
    const line = parseIrcLine(":vasya!v@v PRIVMSG #s :!10000");
    assert.ok(line);
    assert.equal(toMessage(line), null);
  });
});

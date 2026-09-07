import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NEVER } from "@/lib/game/bet";
import { parseCommand, parseSum, twitchNickname } from "./twitch";

/**
 * Разбор команд из чата. Зритель пишет как придётся, а ставка должна доехать
 * до стола — или не доехать вовсе, если это просто разговор.
 */

describe("суммы", () => {
  it("простое число", () => {
    assert.equal(parseSum("10000"), 10_000);
  });

  it("пробелы разрядами не мешают", () => {
    assert.equal(parseSum("1 000 000"), 1_000_000);
  });

  it("«к» и «м» умножают", () => {
    assert.equal(parseSum("10к"), 10_000);
    assert.equal(parseSum("10k"), 10_000);
    assert.equal(parseSum("2м"), 2_000_000);
    assert.equal(parseSum("3кк"), 3_000_000);
  });

  it("дробное с множителем округляется", () => {
    assert.equal(parseSum("1.5к"), 1_500);
    assert.equal(parseSum("1,5к"), 1_500);
  });

  it("выше потолка не принимается", () => {
    assert.equal(parseSum("2000000000"), null);
    assert.equal(parseSum("5000м"), null);
  });

  it("мусор отбрасывается", () => {
    assert.equal(parseSum("много"), null);
    assert.equal(parseSum("-5"), null);
    assert.equal(parseSum(""), null);
  });
});

describe("команды", () => {
  it("голая сумма — это ставка", () => {
    assert.deepEqual(parseCommand("!10000"), { kind: "bet", bet: 10_000 });
    assert.deepEqual(parseCommand("!50к"), { kind: "bet", bet: 50_000 });
  });

  it("ставка словом", () => {
    assert.deepEqual(parseCommand("!ставка 300"), { kind: "bet", bet: 300 });
    assert.deepEqual(parseCommand("!bet 1k"), { kind: "bet", bet: 1_000 });
  });

  it("крайние ответы", () => {
    assert.deepEqual(parseCommand("!бесплатно"), { kind: "bet", bet: 0 });
    assert.deepEqual(parseCommand("!даром"), { kind: "bet", bet: 0 });
    assert.deepEqual(parseCommand("!никогда"), { kind: "bet", bet: NEVER });
    assert.deepEqual(parseCommand("!never"), { kind: "bet", bet: NEVER });
  });

  it("сесть и встать", () => {
    assert.deepEqual(parseCommand("!я"), { kind: "join" });
    assert.deepEqual(parseCommand("!играю"), { kind: "join" });
    assert.deepEqual(parseCommand("!выход"), { kind: "leave" });
  });

  it("вопрос и таблица", () => {
    assert.deepEqual(parseCommand("!вопрос"), { kind: "question" });
    assert.deepEqual(parseCommand("!топ"), { kind: "top" });
  });

  it("регистр и пробелы не важны", () => {
    assert.deepEqual(parseCommand("  !БЕСПЛАТНО  "), { kind: "bet", bet: 0 });
    assert.deepEqual(parseCommand("!Ставка   777"), { kind: "bet", bet: 777 });
  });

  it("разговор командой не считается", () => {
    assert.equal(parseCommand("привет всем"), null);
    assert.equal(parseCommand("10000"), null);
    assert.equal(parseCommand("!"), null);
    assert.equal(parseCommand("!чтотоневнятное"), null);
  });

  it("ноль — это «бесплатно», а не отсутствие ставки", () => {
    assert.deepEqual(parseCommand("!0"), { kind: "bet", bet: 0 });
  });
});

describe("ник зрителя", () => {
  it("берётся отображаемый", () => {
    assert.equal(twitchNickname("Толя", "tolya123"), "Толя");
  });

  it("без отображаемого — логин", () => {
    assert.equal(twitchNickname(undefined, "tolya123"), "tolya123");
    assert.equal(twitchNickname("  ", "tolya123"), "tolya123");
  });
});

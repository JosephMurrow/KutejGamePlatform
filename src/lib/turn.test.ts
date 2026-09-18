import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blinkTitle, turnEvent } from "./turn";

describe("turnEvent", () => {
  it("первый снимок после входа никого не зовёт", () => {
    assert.equal(turnEvent(undefined, "white", true, false), null);
  });

  it("ход перешёл ко мне — зов игроку", () => {
    assert.equal(turnEvent("black", "white", true, false), "mine");
    assert.equal(turnEvent(null, "white", true, false), "mine");
  });

  it("ход ушёл сопернику — игрока не зовём", () => {
    assert.equal(turnEvent("white", "black", false, false), null);
  });

  it("зрителю — попап о том, кто ходит", () => {
    assert.equal(turnEvent("white", "black", false, true), "watch");
  });

  it("метка не поменялась — лишний ход в ту же очередь не зовёт повторно", () => {
    assert.equal(turnEvent("0", "0", true, false), null);
  });

  it("ходить некому — молчим", () => {
    assert.equal(turnEvent("white", null, true, false), null);
  });
});

describe("blinkTitle", () => {
  it("зов и прежний заголовок идут по очереди", () => {
    assert.equal(blinkTitle(0, "● Твой ход", "Кутёж"), "● Твой ход");
    assert.equal(blinkTitle(1, "● Твой ход", "Кутёж"), "Кутёж");
    assert.equal(blinkTitle(2, "● Твой ход", "Кутёж"), "● Твой ход");
  });
});

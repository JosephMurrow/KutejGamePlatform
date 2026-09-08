import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TIMINGS, Room, type QuestionSource } from "./room";

/**
 * Комната, где ведёт всегда хозяин, и досрочное вскрытие по его кнопке.
 *
 * И то и другое заведено ради толпы: круг ходов на аудитории доходит до
 * зрителя раз в сутки, а «закрываем, когда поставили все» не наступает никогда
 * (см. src/games/pricetitute/docs/BACKLOG.md N3 и N5).
 */

class Endless implements QuestionSource {
  private counter = 0;

  next(): string | null {
    this.counter += 1;
    return `q${this.counter}`;
  }

  burn(): void {}
}

const T = DEFAULT_TIMINGS;

/** Комната с хозяином «толя» и заданным числом зрителей. */
function streamRoom(viewers: number) {
  const room = new Room("stream", new Endless(), {
    ownerId: "толя",
    hostRotation: "owner",
  });

  room.join("толя", 0);
  for (let i = 0; i < viewers; i++) room.join(`зритель-${i}`, 0);

  return room;
}

/** Провести раунд целиком, вернуть того, кто вёл. */
function spin(room: Room, at: number): string {
  const host = room.view().hostId;
  assert.ok(host, "раунд идёт без ведущего");

  room.confirmRead(host, at);
  room.submitHostAnswer(host, 1000, at);

  for (const player of room.view().players) {
    if (player.id !== host) room.placeBet(player.id, 1000, at);
  }

  room.tick(at + T.revealMs);
  return host;
}

describe("ведущий всегда хозяин", () => {
  it("ход не уходит по кругу", () => {
    const room = streamRoom(4);

    const hosts = [0, 1, 2, 3, 4].map((round) => spin(room, round * 1000));

    assert.deepEqual(new Set(hosts), new Set(["толя"]));
  });

  it("зрители по-прежнему набирают очки", () => {
    const room = streamRoom(2);

    const host = room.view().hostId;
    assert.equal(host, "толя");

    room.confirmRead("толя", 0);
    room.submitHostAnswer("толя", 1000, 0);
    room.placeBet("зритель-0", 1200, 0);
    room.placeBet("зритель-1", 500_000, 0);
    room.tick(T.revealMs);

    const players = new Map(room.view().players.map((p) => [p.id, p.score]));
    assert.equal(players.get("зритель-0"), 1);
    assert.equal(players.get("зритель-1"), 0);
    assert.equal(
      players.get("толя"),
      0,
      "ведущий очков за свой раунд не берёт",
    );
  });

  it("хозяин вышел — комната не встаёт, водят по кругу", () => {
    const room = streamRoom(2);

    spin(room, 0);
    room.leave("толя", 1000);

    const host = room.view().hostId;
    assert.ok(host, "без хозяина раунд должен идти дальше");
    assert.notEqual(host, "толя");
  });

  it("по умолчанию круг остаётся кругом", () => {
    const room = new Room("circle", new Endless(), { ownerId: "толя" });
    room.join("толя", 0);
    room.join("вася", 0);

    const hosts = [spin(room, 0), spin(room, 1000)];
    assert.deepEqual(hosts, ["толя", "вася"]);
  });
});

describe("досрочное вскрытие", () => {
  /** Комната в фазе ставок: хозяин ответил, зрители молчат. */
  function betting() {
    const room = streamRoom(3);
    room.confirmRead("толя", 0);
    room.submitHostAnswer("толя", 1000, 0);
    return room;
  }

  it("хозяин вскрывает, не дожидаясь молчунов", () => {
    const room = betting();
    room.placeBet("зритель-0", 900, 0);

    const result = room.closeBetting("толя", 0);

    assert.ok(result.accepted);
    assert.equal(room.view().phase, "reveal");
    assert.equal(
      room.view().reveal?.bets.length,
      1,
      "молчуны в ставки не идут",
    );
  });

  it("зритель вскрыть не может", () => {
    const room = betting();

    const result = room.closeBetting("зритель-0", 0);

    assert.equal(result.accepted, false);
    assert.equal(room.view().phase, "betting");
  });

  it("вне фазы ставок кнопка не работает", () => {
    const room = streamRoom(2);

    const result = room.closeBetting("толя", 0);

    assert.equal(result.accepted, false);
    assert.equal(room.view().phase, "ready");
  });

  it("очки за досрочно вскрытый раунд начисляются как обычно", () => {
    const room = betting();
    room.placeBet("зритель-1", 1000, 0);

    room.closeBetting("толя", 0);

    const players = new Map(room.view().players.map((p) => [p.id, p.score]));
    assert.equal(players.get("зритель-1"), 1);
  });
});

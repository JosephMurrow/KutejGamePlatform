import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_TIMINGS,
  Room,
  type QuestionSource,
  type RoomOptions,
} from "./room";

/** Правила приватной комнаты: условие конца партии и права хозяина. */

class Endless implements QuestionSource {
  private counter = 0;

  next(): string | null {
    this.counter += 1;
    return `q${this.counter}`;
  }

  burn(): void {}
}

/** Раунд целиком; ставку победителя можно задать, чтобы копить очки нужному. */
function spin(room: Room, at: number, winnerBet = 1000): void {
  const host = room.view().hostId;
  assert.ok(host, "раунд идёт без ведущего");

  room.confirmRead(host, at);
  room.submitHostAnswer(host, 1000, at);

  for (const player of room.view().players) {
    if (player.id === host) continue;
    room.placeBet(player.id, player.id === "аня" ? winnerBet : 1, at);
  }

  room.tick(at + DEFAULT_TIMINGS.revealMs);
}

function privateRoom(options: RoomOptions = {}) {
  const room = new Room("приватная", new Endless(), {
    ownerId: "аня",
    ...options,
  });
  room.join("аня", 0);
  room.join("боря", 0);
  return room;
}

describe("Приватная комната: конец партии", () => {
  it("без условия играет бесконечно", () => {
    const room = privateRoom();

    for (let i = 0; i < 6; i++) spin(room, 1000 * (i + 1));

    assert.notEqual(room.view().phase, "finished");
  });

  it("останавливается после заданного числа раундов", () => {
    const room = privateRoom({ endMode: "rounds", endValue: 3 });

    for (let i = 0; i < 3; i++) spin(room, 1000 * (i + 1));

    const view = room.view();
    assert.equal(view.phase, "finished");
    assert.equal(view.roundsPlayed, 3);
    assert.equal(
      view.deadline,
      null,
      "на финальном экране таймера быть не должно",
    );
  });

  it("останавливается, когда кто-то набрал нужные очки", () => {
    const room = privateRoom({ endMode: "points", endValue: 2 });

    // Играем, пока партия не закроется сама; в комнате вдвоём очко каждый
    // раунд забирает единственный не-ведущий, так что двух очков ждать недолго.
    for (let i = 0; i < 6 && room.view().phase !== "finished"; i++) {
      spin(room, 1000 * (i + 1));
    }

    const view = room.view();
    assert.equal(view.phase, "finished");
    assert.ok(view.winners && view.winners.length > 0, "победитель не назван");

    for (const id of view.winners) {
      const player = view.players.find((entry) => entry.id === id);
      assert.ok(
        player && player.score >= 2,
        `у победителя ${id} меньше двух очков`,
      );
    }
  });

  it("объявляет победителем того, у кого больше очков", () => {
    const room = privateRoom({ endMode: "rounds", endValue: 2 });

    spin(room, 1000);
    spin(room, 2000);

    const view = room.view();
    const best = Math.max(...view.players.map((player) => player.score));
    assert.ok(view.winners);
    for (const id of view.winners) {
      assert.equal(view.players.find((p) => p.id === id)?.score, best);
    }
  });

  it("на финальном экране время не идёт", () => {
    const room = privateRoom({ endMode: "rounds", endValue: 1 });
    spin(room, 1000);

    assert.deepEqual(room.tick(999_999), []);
    assert.equal(room.view().phase, "finished");
  });
});

describe("Приватная комната: права хозяина", () => {
  it("хозяин выгоняет игрока", () => {
    const room = privateRoom();
    room.join("витя", 0);

    const result = room.kick("аня", "витя", 100);

    assert.equal(result.accepted, true);
    assert.ok(!room.view().players.some((player) => player.id === "витя"));
  });

  it("обычный игрок выгонять не может", () => {
    const room = privateRoom();
    room.join("витя", 0);

    const result = room.kick("боря", "витя", 100);

    assert.equal(result.accepted, false);
    assert.equal(room.view().players.length, 3);
  });

  it("хозяин не может выгнать сам себя", () => {
    const room = privateRoom();
    assert.equal(room.kick("аня", "аня", 100).accepted, false);
  });

  it("в общей комнате выгонять нельзя вообще", () => {
    const room = new Room("global", new Endless());
    room.join("аня", 0);
    room.join("боря", 0);

    assert.equal(room.kick("аня", "боря", 100).accepted, false);
  });

  it("хозяин начинает новую партию, счёт обнуляется", () => {
    const room = privateRoom({ endMode: "rounds", endValue: 1 });
    spin(room, 1000);
    assert.equal(room.view().phase, "finished");

    const result = room.restart("аня", 5000);

    assert.equal(result.accepted, true);
    assert.equal(room.view().phase, "ready");
    assert.equal(room.view().roundsPlayed, 0);
    assert.ok(room.view().players.every((player) => player.score === 0));
    assert.equal(room.view().winners, null);
  });

  it("не хозяин новую партию не начинает", () => {
    const room = privateRoom({ endMode: "rounds", endValue: 1 });
    spin(room, 1000);

    assert.equal(room.restart("боря", 5000).accepted, false);
    assert.equal(room.view().phase, "finished");
  });

  it("нельзя перезапустить недоигранную партию", () => {
    const room = privateRoom({ endMode: "rounds", endValue: 5 });
    spin(room, 1000);

    assert.equal(room.restart("аня", 2000).accepted, false);
  });
});

describe("Приватная комната: свои таймеры", () => {
  it("берёт заданную длительность ставок", () => {
    const room = new Room("приватная", new Endless(), {
      ownerId: "аня",
      timings: { bettingMs: 60_000 },
    });
    room.join("аня", 0);
    room.join("боря", 0);

    room.confirmRead("аня", 100);
    room.submitHostAnswer("аня", 1000, 100);

    assert.equal(room.view().deadline, 100 + 60_000);
  });

  it("остальные фазы остаются стандартными", () => {
    const room = new Room("приватная", new Endless(), {
      timings: { bettingMs: 60_000 },
    });
    room.join("аня", 0);
    room.join("боря", 0);

    assert.equal(room.view().deadline, DEFAULT_TIMINGS.readyMs);
  });
});

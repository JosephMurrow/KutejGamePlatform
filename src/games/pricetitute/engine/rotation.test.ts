import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TIMINGS, Room, type QuestionSource } from "./room";

/**
 * Круг ходов под нагрузкой: много игроков, приходы и уходы посреди цикла.
 * Именно здесь легче всего сломать очередь — проверяем, что ход обходит всех
 * ровно по разу и не сбивается от текучки.
 */

class Endless implements QuestionSource {
  private counter = 0;

  next(): string | null {
    this.counter += 1;
    return `q${this.counter}`;
  }

  burn(): void {}
}

/** Провести раунд целиком и вернуть того, кто его вёл. */
function spin(room: Room, at: number): string {
  const host = room.view().hostId;
  assert.ok(host, "раунд идёт без ведущего");

  room.confirmRead(host, at);
  room.submitHostAnswer(host, 1000, at);

  for (const player of room.view().players) {
    if (player.id !== host) room.placeBet(player.id, 1000, at);
  }

  room.tick(at + DEFAULT_TIMINGS.revealMs);
  return host;
}

function roomWith(count: number): { room: Room; players: string[] } {
  const room = new Room("crowd", new Endless());
  const players = Array.from({ length: count }, (_, i) => `игрок-${i}`);

  for (const player of players) room.join(player, 0);
  return { room, players };
}

describe("Круг ходов в людной комнате", () => {
  it("за полный круг ведущим побывает каждый ровно по разу", () => {
    const { room, players } = roomWith(30);

    const hosts: string[] = [];
    for (let i = 0; i < players.length; i++) {
      hosts.push(spin(room, 1000 * (i + 1)));
    }

    assert.equal(new Set(hosts).size, players.length, "кто-то вёл дважды");
    assert.deepEqual([...hosts].sort(), [...players].sort());
  });

  it("после полного круга очередь начинается сначала, а не сбивается", () => {
    const { room, players } = roomWith(5);

    const first: string[] = [];
    const second: string[] = [];
    for (let i = 0; i < players.length; i++) first.push(spin(room, 1000 * i));
    for (let i = 0; i < players.length; i++)
      second.push(spin(room, 10_000 + 1000 * i));

    assert.deepEqual(second, first, "второй круг пошёл в другом порядке");
  });

  it("уход того, чья очередь ещё впереди, не сдвигает остальных", () => {
    const room = new Room("crowd", new Endless());
    for (const id of ["а", "б", "в", "г", "д"]) room.join(id, 0);

    assert.equal(spin(room, 1000), "а");
    assert.equal(spin(room, 2000), "б");

    room.leave("в", 2500);

    assert.equal(spin(room, 3000), "г", "после ухода «в» вести должен «г»");
    assert.equal(spin(room, 4000), "д");
    assert.equal(spin(room, 5000), "а", "круг должен замкнуться");
  });

  it("уход уже отведшего не ломает порядок оставшихся", () => {
    const room = new Room("crowd", new Endless());
    for (const id of ["а", "б", "в", "г"]) room.join(id, 0);

    assert.equal(spin(room, 1000), "а");
    assert.equal(spin(room, 2000), "б");

    room.leave("а", 2500);

    assert.equal(spin(room, 3000), "в");
    assert.equal(spin(room, 4000), "г");
    assert.equal(spin(room, 5000), "б", "круг замкнулся на оставшихся");
  });

  it("новичок встаёт в конец круга и дожидается своего хода", () => {
    const room = new Room("crowd", new Endless());
    for (const id of ["а", "б", "в"]) room.join(id, 0);

    assert.equal(spin(room, 1000), "а");
    room.join("новичок", 1500);

    assert.equal(spin(room, 2000), "б");
    assert.equal(spin(room, 3000), "в");
    assert.equal(spin(room, 4000), "новичок", "новичок пропущен");
    assert.equal(spin(room, 5000), "а");
  });

  it("текучка в половину состава не ломает круг", () => {
    const { room } = roomWith(10);

    // Пять раундов, и на каждом кто-то уходит, а кто-то приходит.
    for (let i = 0; i < 5; i++) {
      spin(room, 1000 * (i + 1));
      room.leave(`игрок-${i}`, 1000 * (i + 1) + 500);
      room.join(`новый-${i}`, 1000 * (i + 1) + 600);
    }

    const view = room.view();
    assert.equal(view.players.length, 10, "состав комнаты разъехался");
    assert.notEqual(view.phase, "waiting", "игра встала без причины");

    // Дальше круг должен идти без повторов подряд.
    const hosts: string[] = [];
    for (let i = 0; i < 10; i++) hosts.push(spin(room, 20_000 + 1000 * i));

    assert.equal(new Set(hosts).size, 10, "в круге появились повторы");
  });

  it("комната встаёт на паузу, когда разошлись все, кроме одного", () => {
    const { room, players } = roomWith(4);

    for (const player of players.slice(1)) room.leave(player, 1000);

    assert.equal(room.view().phase, "waiting");
    assert.equal(room.view().pauseReason, "not_enough_players");
  });
});

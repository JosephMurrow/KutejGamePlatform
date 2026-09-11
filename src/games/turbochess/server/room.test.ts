import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameRoomContext } from "@/lib/games/engine";
import type { TurboMode } from "../modes/catalog";
import { createTurboServer } from ".";
import { ClosedHall } from "./hall";
import { TurboRoom } from "./room";

/**
 * Стол турбо-шахмат без сети: платформу изображает поддельный контекст. Так
 * проверяется весь стык, кроме сокета.
 */

function setup(mode: TurboMode = "ONE_KIND", isPrivate = true) {
  let changes = 0;
  const context: GameRoomContext = {
    key: "turbo-test",
    ownerId: "host",
    isPrivate,
    settings: { mode, options: {} },
    connections: () => 0,
    introduce: () => {},
    forget: () => {},
    emitted: () => {},
    changed: () => {
      changes += 1;
    },
  };

  return { context, changes: () => changes };
}

describe("стол", () => {
  it("сажает двоих, третий остаётся зрителем", () => {
    const { context } = setup();
    const room = new TurboRoom(context, { mode: "ONE_KIND", options: {} });

    room.join("host");
    room.join("guest");
    room.join("watcher");

    assert.deepEqual(room.seated(), ["host", "guest"]);
    assert.equal(room.snapshot().extra.phase, "ready");
  });

  it("в королевской битве сажает четверых", () => {
    const { context } = setup("BATTLE_ROYALE");
    const room = new TurboRoom(context, {
      mode: "BATTLE_ROYALE",
      options: {},
    });

    for (const id of ["a", "b", "c"]) room.join(id);
    assert.equal(room.snapshot().extra.phase, "waiting");

    room.join("d");
    room.join("e");

    assert.deepEqual(room.seated(), ["a", "b", "c", "d"]);
    assert.equal(room.snapshot().extra.seats, 4);
  });

  it("повторный вход не занимает второе место", () => {
    const { context } = setup();
    const room = new TurboRoom(context, { mode: "ONE_KIND", options: {} });

    room.join("host");
    room.join("host");

    assert.deepEqual(room.seated(), ["host"]);
  });

  it("ушедший освобождает место, и о каждой перемене узнаёт платформа", () => {
    const { context, changes } = setup();
    const room = new TurboRoom(context, { mode: "ONE_KIND", options: {} });

    room.join("host");
    room.join("guest");
    room.leave("guest");
    room.join("watcher");

    assert.deepEqual(room.seated(), ["host", "watcher"]);
    assert.equal(changes(), 4);
  });

  it("выгоняет только хозяин", () => {
    const { context } = setup();
    const room = new TurboRoom(context, { mode: "ONE_KIND", options: {} });
    room.join("host");
    room.join("guest");

    assert.equal(room.remove("guest", "host").accepted, false);
    assert.equal(room.remove("host", "guest").accepted, true);
    assert.deepEqual(room.seated(), ["host"]);
  });

  it("снимок называет режим и места, часов нет", () => {
    const { context } = setup("SHOWDOWN");
    const room = new TurboRoom(context, { mode: "SHOWDOWN", options: {} });
    room.join("host");

    const snapshot = room.snapshot();
    assert.equal(snapshot.deadline, null);
    assert.equal(room.deadline(), null);
    assert.deepEqual(snapshot.players, [{ id: "host", extra: { seat: 0 } }]);
    assert.deepEqual(snapshot.extra, {
      phase: "waiting",
      mode: "SHOWDOWN",
      seats: 2,
    });
  });

  it("действия пока отбивает", () => {
    const { context } = setup();
    const room = new TurboRoom(context, { mode: "ONE_KIND", options: {} });

    assert.equal(room.act().accepted, false);
  });
});

describe("закрытая дверь вместо общего зала", () => {
  it("никого не сажает и всё отбивает", () => {
    const hall = new ClosedHall();

    hall.join();
    assert.deepEqual(hall.seated(), []);
    assert.equal(hall.act().accepted, false);
    assert.equal(hall.snapshot().extra.phase, "closed");
  });

  it("сервер ставит её за ключом общего зала, а свою комнату — столом", async () => {
    const server = createTurboServer();

    const hall = await server.createRoom(setup("ONE_KIND", false).context);
    const room = await server.createRoom(setup("ONE_KIND", true).context);

    assert.ok(hall instanceof ClosedHall);
    assert.ok(room instanceof TurboRoom);
    server.stop();
  });

  it("комната без настроек играет умолчанием", async () => {
    const server = createTurboServer();
    const { context } = setup();

    const room = await server.createRoom({ ...context, settings: null });

    assert.equal(room.snapshot({ kind: "screen" }).extra.mode, "ONE_KIND");
    server.stop();
  });
});

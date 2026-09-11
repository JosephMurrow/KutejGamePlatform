import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameRoomContext, GameRoomEvent } from "@/lib/games/engine";
import type { TimeControl, TurboRoomSettings } from "../rooms/settings";
import { GAME_EVENT } from "../protocol";
import { createTurboServer } from ".";
import { ClosedHall } from "./hall";
import { TurboRoom, type MatchDraft } from "./room";

/**
 * Комната без сети: платформу изображает поддельный контекст, время —
 * управляемые монотонные часы. Так проверяется весь стык, кроме сокета, а
 * сокет проверяет смоук.
 */

function setup(timeControl: TimeControl = "SEC_30") {
  let at = 1000;
  const changes: number[] = [];
  const events: GameRoomEvent[] = [];
  const drafts: MatchDraft[] = [];
  const settings: TurboRoomSettings = {
    mode: "CLASSIC",
    timeControl,
    options: {},
  };
  const context: GameRoomContext = {
    key: "turbo-test",
    ownerId: "host",
    isPrivate: true,
    settings,
    connections: () => 2,
    introduce: () => {},
    forget: () => {},
    emitted: (list) => events.push(...list),
    changed: () => changes.push(at),
  };
  const room = new TurboRoom(
    context,
    settings,
    () => at,
    (draft) => drafts.push(draft),
  );

  return {
    room,
    changes,
    events,
    drafts,
    pass: (ms: number) => {
      at += ms;
    },
  };
}

/** Посадить двоих: первый — белые, второй — чёрные. */
function seated(timeControl?: TimeControl) {
  const table = setup(timeControl);
  table.room.join("white");
  table.room.join("black");
  return table;
}

function view(room: TurboRoom, viewer = "white") {
  return room.snapshot({ kind: "player", id: viewer }).extra;
}

function move(
  room: TurboRoom,
  player: string,
  from: string,
  to: string,
  promotion?: string,
) {
  const ply = (view(room).moves as string[]).length;
  return room.act(GAME_EVENT.move, player, {
    from,
    to,
    ply,
    ...(promotion ? { promotion } : {}),
  });
}

describe("посадка", () => {
  it("садятся двое, третий смотрит; партия начинается, когда стол полон", () => {
    const { room } = setup();
    room.join("white");
    assert.equal(view(room).phase, "waiting");
    assert.equal(view(room).turn, null, "ходить ещё некому");

    room.join("black");
    room.join("watcher");

    assert.deepEqual(room.seated(), ["white", "black"]);
    assert.equal(view(room).phase, "playing");
    assert.equal(view(room).turn, 0);
    assert.equal(view(room).seats, 2);
  });

  it("до партии ушедший освобождает место", () => {
    const { room } = setup();
    room.join("white");
    room.leave("white");
    room.join("black");

    assert.deepEqual(room.seated(), ["black"]);
    assert.equal(view(room, "black").phase, "waiting");
  });

  it("позиция в снимке есть и до начала партии", () => {
    const { room } = setup();
    room.join("white");

    const position = view(room).position as { board: unknown[] };
    assert.equal(position.board.length, 64);
  });
});

describe("ходы", () => {
  it("принятый ход меняет очередь и попадает в запись", () => {
    const { room, changes } = seated();
    const before = changes.length;

    assert.deepEqual(move(room, "white", "e2", "e4"), { accepted: true });
    assert.deepEqual(view(room).moves, ["e4"]);
    assert.deepEqual(view(room).lastMove, { from: "e2", to: "e4" });
    assert.equal(view(room).turn, 1);
    assert.ok(changes.length > before, "платформа узнала о ходе");
  });

  it("отказы — внятным текстом", () => {
    const { room } = seated();

    assert.equal(move(room, "watcher", "e2", "e4").reason, "Ты не за доской");
    assert.equal(move(room, "black", "e7", "e5").reason, "Сейчас не твой ход");
    assert.equal(move(room, "white", "e2", "e5").reason, "Так не ходят");
    assert.equal(
      room.act(GAME_EVENT.move, "white", { from: "e2", to: "e4", ply: 5 })
        .reason,
      "Этот ход уже сделан",
    );
    assert.equal(
      room.act(GAME_EVENT.move, "white", { from: 1, to: "e4", ply: 0 }).reason,
      "Непонятный ход",
    );
    assert.equal(
      room.act(GAME_EVENT.move, "white", "e2e4").reason,
      "Непонятный ход",
    );
  });

  it("до второго игрока ходить нельзя", () => {
    const { room } = setup();
    room.join("white");

    assert.equal(move(room, "white", "e2", "e4").reason, "Соперник ещё не сел");
  });

  it("считает, сколько думали над ходом", () => {
    const { room, pass, drafts } = seated();
    pass(1500);
    move(room, "white", "e2", "e4");
    pass(700);
    move(room, "black", "e7", "e5");
    room.act(GAME_EVENT.resign, "white", {});

    assert.deepEqual(drafts[0]?.times, [1500, 700]);
  });
});

describe("часы", () => {
  it("идут только в партии; без лимита будильника нет вовсе", () => {
    const waiting = setup();
    waiting.room.join("white");
    assert.equal(waiting.room.deadline(), null);

    assert.notEqual(seated("SEC_30").room.deadline(), null);
    assert.equal(seated("UNLIMITED").room.deadline(), null);
  });

  it("флаг — поражение того, чья очередь", () => {
    const { room, pass, drafts } = seated("SEC_10");
    move(room, "white", "e2", "e4");
    pass(10_000);
    room.tick();

    assert.equal(view(room).phase, "over");
    assert.equal(view(room).result, 0);
    assert.equal(view(room).reason, "flag");
    assert.equal(drafts.length, 1);
  });

  it("после хода счёт начинается заново", () => {
    const { room, pass } = seated("SEC_10");
    pass(9000);
    move(room, "white", "e2", "e4");
    pass(9000);
    room.tick();

    assert.equal(view(room).phase, "playing");
  });
});

describe("уход и возврат", () => {
  it("посреди партии место держится, соперник видит, что игрок вышел", () => {
    const { room } = seated("UNLIMITED");
    room.leave("black");

    assert.deepEqual(room.seated(), ["white", "black"]);
    const black = room
      .snapshot({ kind: "screen" })
      .players.find((player) => player.id === "black");
    assert.equal(black?.extra.away, true);
    assert.notEqual(room.deadline(), null, "будильник на ожидание заведён");
  });

  it("вернулся — ждать перестали", () => {
    const { room, pass } = seated("UNLIMITED");
    room.leave("black");
    pass(60_000);
    room.join("black");
    pass(60_000);
    room.tick();

    assert.equal(view(room).phase, "playing");
    assert.equal(room.deadline(), null);
  });

  it("не вернулся за полторы минуты — партия достаётся сопернику", () => {
    const { room, pass } = seated("UNLIMITED");
    move(room, "white", "e2", "e4");
    room.leave("black");
    pass(90_000);
    room.tick();

    assert.equal(view(room).result, 0);
    assert.equal(view(room).reason, "abandoned");
  });
});

describe("ничьи", () => {
  it("предложение видят только сидящие, а принятое — ничья", () => {
    const { room } = seated();
    assert.deepEqual(room.act(GAME_EVENT.offerDraw, "white", {}), {
      accepted: true,
    });

    assert.equal(view(room, "black").drawOffer, 0);
    assert.equal(room.snapshot({ kind: "screen" }).extra.drawOffer, null);

    room.act(GAME_EVENT.offerDraw, "black", {});
    assert.equal(view(room).result, "draw");
    assert.equal(view(room).reason, "agreement");
  });

  it("отказ снимает предложение; повторить сразу нельзя", () => {
    const { room } = seated();
    room.act(GAME_EVENT.offerDraw, "white", {});
    room.act(GAME_EVENT.declineDraw, "black", {});

    assert.equal(view(room).drawOffer, null);
    assert.equal(
      room.act(GAME_EVENT.offerDraw, "white", {}).reason,
      "Ничью только что предлагали",
    );
  });

  it("предложение живёт до следующего хода", () => {
    const { room } = seated();
    room.act(GAME_EVENT.offerDraw, "black", {});
    move(room, "white", "e2", "e4");

    assert.equal(view(room).drawOffer, null);
  });

  it("требовать ничью без основания нельзя, с повторением — можно", () => {
    const { room } = seated();
    assert.equal(
      room.act(GAME_EVENT.claimDraw, "white", {}).reason,
      "Требовать ничью пока не на чем",
    );

    for (let round = 0; round < 2; round++) {
      move(room, "white", "g1", "f3");
      move(room, "black", "g8", "f6");
      move(room, "white", "f3", "g1");
      move(room, "black", "f6", "g8");
    }
    assert.equal(view(room).claimable, "threefold");

    // Требовать может и тот, чья очередь не его.
    room.act(GAME_EVENT.claimDraw, "black", {});
    assert.equal(view(room).reason, "threefold");
  });
});

describe("сдача, реванш и новая партия", () => {
  it("сдача отдаёт партию сопернику; партия без ходов не пишется", () => {
    const { room, drafts } = seated();
    room.act(GAME_EVENT.resign, "black", {});

    assert.equal(view(room).result, 0);
    assert.equal(drafts.length, 0, "ни одного хода — нечего записывать");
  });

  it("реванш меняет места и начинает новую партию с новой записью", () => {
    const { room, drafts } = seated();
    move(room, "white", "e2", "e4");
    room.act(GAME_EVENT.resign, "black", {});

    assert.equal(room.act(GAME_EVENT.rematch, "white", {}).accepted, true);
    assert.deepEqual(room.seated(), ["black", "white"]);
    assert.equal(view(room).phase, "playing");
    assert.deepEqual(view(room).moves, []);

    move(room, "black", "d2", "d4");
    room.act(GAME_EVENT.resign, "white", {});
    assert.equal(drafts.length, 2);
    assert.notEqual(drafts[0]?.id, drafts[1]?.id);
    assert.deepEqual(drafts[1]?.seats, ["black", "white"]);
  });

  it("реванш посреди партии не бывает", () => {
    const { room } = seated();
    assert.equal(
      room.act(GAME_EVENT.rematch, "white", {}).reason,
      "Партия ещё идёт",
    );
  });

  it("ушёл после партии — на его место садится новый, и партия новая", () => {
    const { room, drafts } = seated();
    move(room, "white", "e2", "e4");
    room.act(GAME_EVENT.resign, "black", {});
    room.leave("black");
    assert.deepEqual(room.seated(), ["white"]);

    room.join("newcomer");
    assert.equal(view(room).phase, "playing");
    assert.deepEqual(view(room).moves, []);

    move(room, "white", "d2", "d4");
    room.act(GAME_EVENT.resign, "newcomer", {});
    assert.notEqual(drafts[0]?.id, drafts[1]?.id);
  });

  it("партия упирается в потолок по времени", () => {
    const { room, pass } = seated("UNLIMITED");
    pass(3 * 60 * 60 * 1000);
    move(room, "white", "e2", "e4");

    assert.equal(view(room).reason, "tooLong");
    assert.equal(view(room).result, "draw");
  });
});

describe("запись партии", () => {
  it("несёт режим, зерно, места, ходы и итог", () => {
    const { room, drafts, events } = seated("MIN_1");
    for (const [player, from, to] of [
      ["white", "e2", "e4"],
      ["black", "e7", "e5"],
      ["white", "f1", "c4"],
      ["black", "b8", "c6"],
      ["white", "d1", "h5"],
      ["black", "g8", "f6"],
      ["white", "h5", "f7"],
    ] as const) {
      move(room, player, from, to);
    }

    const draft = drafts[0];
    assert.ok(draft, "партия записана");
    assert.equal(draft.mode, "CLASSIC");
    assert.equal(draft.timeControl, "MIN_1");
    assert.deepEqual(draft.seats, ["white", "black"]);
    assert.equal(draft.moves.at(-1), "Qxf7#");
    assert.equal(draft.winner, 0);
    assert.equal(draft.reason, "checkmate");
    assert.ok(Number.isInteger(draft.seed) && draft.seed >= 0);
    assert.equal(events.at(-1)?.type, "turbochess_finished");
  });
});

describe("выгнать", () => {
  it("может только хозяин; посреди партии это то же, что уйти", () => {
    const { room } = setup();
    room.join("host");
    room.join("guest");

    assert.equal(room.remove("guest", "host").accepted, false);
    assert.equal(room.remove("host", "guest").accepted, true);
    assert.equal(view(room, "host").reason, "abandoned");
    assert.equal(view(room, "host").result, 0);
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
    const context = (isPrivate: boolean): GameRoomContext => ({
      key: "turbo-test",
      ownerId: "host",
      isPrivate,
      settings: null,
      connections: () => 0,
      introduce: () => {},
      forget: () => {},
      emitted: () => {},
      changed: () => {},
    });

    const hall = await server.createRoom(context(false));
    const room = await server.createRoom(context(true));

    assert.ok(hall instanceof ClosedHall);
    assert.ok(room instanceof TurboRoom);
    assert.equal(
      room.snapshot({ kind: "screen" }).extra.mode,
      "ONE_KIND",
      "комната без настроек играет умолчанием",
    );
    server.stop();
  });
});

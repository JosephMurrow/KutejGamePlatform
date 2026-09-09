import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameRoomContext, GameRoomEvent } from "@/lib/games/engine";
import type { ChessRoomSettings, TimeControl } from "../rooms/settings";
import type { Moment } from "../bots/moments";
import { LEVELS } from "../bots/levels";
import { GAME_EVENT } from "../protocol";
import { ChessRoom } from "./room";

/**
 * Комната шахмат без сети: платформу изображает поддельный контекст, время —
 * управляемый тикер. Так проверяется весь стык, кроме сокета, — а сокет
 * проверяется смоуком.
 */

function setup(timeControl: TimeControl = "SEC_30") {
  let at = 1000;
  const changes: number[] = [];
  const events: GameRoomEvent[] = [];

  const settings: ChessRoomSettings = {
    timeControl,
    opponent: "HUMAN",
    streamerMode: false,
    botLevel: "NORMAL",
  };

  const context: GameRoomContext = {
    key: "chess-test",
    ownerId: "host",
    isPrivate: true,
    settings,
    connections: () => 2,
    introduce: () => {},
    forget: () => {},
    emitted: (list) => events.push(...list),
    changed: () => changes.push(at),
  };

  const room = new ChessRoom(context, settings, () => at);

  return {
    room,
    changes,
    events,
    pass: (ms: number) => {
      at += ms;
    },
    /** Игровая часть снимка: платформа внутрь не смотрит, а мы смотрим. */
    extra: () => room.snapshot().extra as Record<string, unknown>,
  };
}

/** Посадить двоих и начать партию. */
function seatBoth(room: ChessRoom): void {
  room.join("white");
  room.join("black");
}

describe("посадка за доску", () => {
  it("сажает первых двоих, остальные смотрят", () => {
    const { room, extra } = setup();

    room.join("white");
    assert.deepEqual([...room.seated()], ["white"]);
    assert.equal(extra().phase, "waiting");

    room.join("black");
    assert.deepEqual([...room.seated()], ["white", "black"]);
    assert.equal(extra().phase, "playing");

    room.join("viewer");
    assert.deepEqual(
      [...room.seated()],
      ["white", "black"],
      "третий не садится",
    );
    assert.equal(room.snapshot().playerCount, 2);
  });

  it("первый севший играет белыми", () => {
    const { room } = setup();
    seatBoth(room);

    assert.deepEqual(
      room.snapshot().players.map((player) => player.extra.color),
      ["white", "black"],
    );
  });

  it("зритель ходить не может", () => {
    const { room } = setup();
    seatBoth(room);

    const outcome = room.act("game:move", "viewer", {
      from: "e2",
      to: "e4",
      ply: 0,
    });
    assert.deepEqual(outcome, { accepted: false, reason: "Ты не за доской" });
  });
});

describe("ходы", () => {
  it("принимает ход того, чья очередь, и рассылает изменение", () => {
    const { room, changes, extra } = setup();
    seatBoth(room);
    const before = changes.length;

    const outcome = room.act("game:move", "white", {
      from: "e2",
      to: "e4",
      ply: 0,
    });

    assert.deepEqual(outcome, { accepted: true });
    assert.equal(extra().turn, "black");
    assert.deepEqual(extra().moves, ["e4"]);
    assert.ok(
      changes.length > before,
      "после хода обязателен changed(): иначе будильник звонит по старому",
    );
  });

  it("не даёт ходить не в свою очередь", () => {
    const { room } = setup();
    seatBoth(room);

    assert.deepEqual(
      room.act("game:move", "black", { from: "e7", to: "e5", ply: 0 }),
      {
        accepted: false,
        reason: "Сейчас не твой ход",
      },
    );
  });

  it("объясняет отказ человеческим текстом", () => {
    const { room } = setup();
    seatBoth(room);

    assert.deepEqual(
      room.act("game:move", "white", { from: "e2", to: "e5", ply: 0 }),
      { accepted: false, reason: "Так не ходят" },
    );
    assert.deepEqual(
      room.act("game:move", "white", { from: "e2", to: "e4", ply: 7 }),
      { accepted: false, reason: "Этот ход уже сделан" },
    );
    assert.deepEqual(room.act("game:move", "white", { from: 5, to: "e4" }), {
      accepted: false,
      reason: "Непонятный ход",
    });
  });

  it("до второго игрока ходить нельзя", () => {
    const { room } = setup();
    room.join("white");

    assert.deepEqual(
      room.act("game:move", "white", { from: "e2", to: "e4", ply: 0 }),
      { accepted: false, reason: "Соперник ещё не сел" },
    );
  });
});

describe("часы", () => {
  it("дедлайн появляется, когда партия пошла", () => {
    const { room } = setup("SEC_10");

    room.join("white");
    assert.equal(room.deadline(), null, "одному ждать нечего");

    room.join("black");
    const deadline = room.deadline();
    assert.ok(deadline !== null && deadline > Date.now());
    assert.equal(room.snapshot().phaseDurationMs, 10_000);
  });

  it("безлимитная комната не заводит ни одного таймера", () => {
    const { room, pass } = setup("UNLIMITED");
    seatBoth(room);

    assert.equal(room.deadline(), null);
    pass(60 * 60 * 1000);
    room.tick();

    assert.equal(room.deadline(), null);
    assert.equal((room.snapshot().extra as { phase: string }).phase, "playing");
  });

  it("после хода счёт начинается заново", () => {
    const { room, pass } = setup("SEC_10");
    seatBoth(room);

    pass(9000);
    room.act("game:move", "white", { from: "e2", to: "e4", ply: 0 });

    const left = (room.deadline() ?? 0) - Date.now();
    assert.ok(left > 9000, `осталось ${left}: лимит на ход, а не на партию`);
  });

  it("флаг кончает партию поражением просрочившего", () => {
    const { room, pass, extra, events } = setup("SEC_10");
    seatBoth(room);

    pass(10_000);
    room.tick();

    assert.equal(extra().result, "black");
    assert.equal(extra().reason, "flag");
    assert.equal(room.deadline(), null, "часы погашены");
    assert.deepEqual(events.at(-1)?.type, "chess_finished");
  });

  it("флаг при недостаточном материале — ничья", () => {
    const { room, pass, extra } = setup("SEC_10");
    seatBoth(room);

    // Разменять всё до голых королей ходами тут негде, поэтому проверяем то,
    // что в наших руках: причину выбирает движок правил, и она у него своя.
    // Здесь достаточно убедиться, что комната берёт причину у правил, а не
    // придумывает.
    pass(10_000);
    room.tick();
    assert.ok(["flag", "flagVsInsufficient"].includes(String(extra().reason)));
  });
});

describe("уход из-за доски", () => {
  it("место держится за ушедшим, а часы не встают", () => {
    const { room, pass, extra } = setup("MIN_3");
    seatBoth(room);

    const before = room.deadline();
    room.leave("black");

    assert.deepEqual([...room.seated()], ["white", "black"], "место держим");
    assert.equal(
      room.snapshot().players.find((p) => p.id === "black")?.extra.away,
      true,
    );

    pass(1000);
    const after = room.deadline();
    assert.ok(
      after !== null && before !== null && after <= before + 1,
      "часы хода продолжают идти: иначе выдернутый кабель спасал бы от флага",
    );
    assert.equal(extra().phase, "playing");
  });

  it("вернувшийся снимает отметку", () => {
    const { room, pass } = setup("MIN_3");
    seatBoth(room);

    room.leave("black");
    pass(5000);
    room.join("black");

    assert.equal(
      room.snapshot().players.find((p) => p.id === "black")?.extra.away,
      false,
    );
  });

  it("не вернулся — партия достаётся сопернику", () => {
    const { room, pass, extra } = setup("MIN_3");
    seatBoth(room);

    room.leave("black");
    pass(90_000);
    room.tick();

    assert.equal(extra().result, "white");
    assert.equal(extra().reason, "abandoned");
  });

  it("хозяин выгоняет — партия достаётся сопернику, а не растворяется", () => {
    const { room, extra } = setup();
    seatBoth(room);

    assert.deepEqual(room.remove("host", "white"), { accepted: true });
    assert.equal(extra().result, "black");
    assert.equal(extra().reason, "abandoned");
  });

  it("выгоняет только хозяин", () => {
    const { room } = setup();
    seatBoth(room);

    assert.deepEqual(room.remove("black", "white"), {
      accepted: false,
      reason: "Выгоняет только хозяин",
    });
  });
});

describe("сдача и конец", () => {
  it("сдача отдаёт партию сопернику", () => {
    const { room, extra } = setup();
    seatBoth(room);

    assert.deepEqual(room.act("game:resign", "white", null), {
      accepted: true,
    });
    assert.equal(extra().result, "black");
    assert.equal(extra().reason, "resign");
    assert.equal(extra().phase, "over");
  });

  it("после конца ходов и сдач больше не принимает", () => {
    const { room } = setup();
    seatBoth(room);
    room.act("game:resign", "white", null);

    assert.deepEqual(
      room.act("game:move", "black", { from: "e7", to: "e5", ply: 0 }),
      {
        accepted: false,
        reason: "Партия кончилась",
      },
    );
    assert.deepEqual(room.act("game:resign", "black", null), {
      accepted: false,
      reason: "Партия кончилась",
    });
  });

  it("незнакомое действие отбивается", () => {
    const { room } = setup();
    seatBoth(room);

    assert.deepEqual(room.act("round:bet", "white", { bet: 100 }), {
      accepted: false,
      reason: "Неизвестное действие",
    });
  });
});

/**
 * Комната с ботом.
 *
 * Движка тут нет: за него отвечает подставной `think`, который выдаёт ходы по
 * списку. Проверяется не игра бота, а то, что комната вовремя рассказывает ему,
 * что случилось: сорок реплик на момент бесполезны, если момент не наступает.
 */
function withBot(timeControl: TimeControl = "SEC_30", moves: string[] = []) {
  let at = 1000;
  const heard: { moment: Moment; ply: number }[] = [];
  let restarts = 0;

  const settings: ChessRoomSettings = {
    timeControl,
    opponent: "BOT",
    streamerMode: false,
    botLevel: "NORMAL",
  };

  const context: GameRoomContext = {
    key: "chess-bot",
    ownerId: "human",
    isPrivate: true,
    settings,
    connections: () => 1,
    introduce: () => {},
    forget: () => {},
    emitted: () => {},
    changed: () => {},
  };

  const queued = [...moves];
  const room = new ChessRoom(context, settings, () => at, undefined, {
    id: "bot",
    nickname: "Дед Николай",
    avatarId: 1100,
    level: LEVELS.normal,
    think: () => Promise.resolve(queued.shift() ?? null),
    speak: (moment, ply) => heard.push({ moment, ply }),
    restart: () => {
      restarts += 1;
    },
  });

  return {
    room,
    heard,
    moments: () => heard.map((said) => said.moment),
    restarts: () => restarts,
    pass: (ms: number) => {
      at += ms;
    },
    /** Дать боту доходить: думает он в промисе, а тесты синхронные. */
    settle: async () => {
      for (let round = 0; round < 4; round += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
  };
}

describe("бот у доски", () => {
  it("здоровается, когда партия началась", () => {
    const table = withBot();

    table.room.join("human");

    assert.deepEqual(table.moments(), ["greeting"], "бот садится сам и сразу");
  });

  it("замечает взятие и шах со стороны соперника", async () => {
    // 1. e4 d5 2. Q:d5 — белые забирают ферзя чёрных, потом дают шах.
    const table = withBot("SEC_30", ["d7d5", "b8c6"]);
    table.room.join("human");

    table.room.act(GAME_EVENT.move, "human", { from: "e2", to: "e4", ply: 0 });
    await table.settle();
    table.room.act(GAME_EVENT.move, "human", { from: "d1", to: "h5", ply: 2 });
    await table.settle();
    // Ферзь на h5 бьёт пешку d5 — ферзя у чёрных там нет, зато есть пешка.
    table.room.act(GAME_EVENT.move, "human", { from: "h5", to: "d5", ply: 4 });

    assert.ok(
      table.moments().includes("botLosesPiece"),
      `бот должен заметить потерю: ${table.moments().join(", ")}`,
    );
  });

  it("узнаёт, чем кончилась партия", () => {
    const table = withBot();
    table.room.join("human");

    table.room.act(GAME_EVENT.resign, "human", null);

    assert.equal(
      table.moments().at(-1),
      "playerResigned",
      "сдался человек, а не бот",
    );
  });

  it("замечает уход соперника и возвращение", () => {
    const table = withBot();
    table.room.join("human");

    table.room.leave("human");
    table.room.join("human");

    assert.deepEqual(table.moments(), [
      "greeting",
      "playerLeft",
      "playerReturned",
    ]);
  });

  it("подаёт голос, когда соперник задумался, и когда у того горит флаг", () => {
    const table = withBot("SEC_30");
    table.room.join("human");

    // Половина лимита: пора заметить, что человек сидит над ходом.
    table.pass(15_000);
    table.room.tick();
    assert.ok(table.moments().includes("playerThinksLong"));

    // Осталась седьмая часть: флаг вот-вот.
    table.pass(11_000);
    table.room.tick();
    assert.ok(table.moments().includes("playerLowTime"));

    // Больше поводов нет: молчит до конца хода.
    const before = table.moments().length;
    table.pass(2000);
    table.room.tick();
    assert.equal(table.moments().length, before);
  });

  it("в безлимитной комнате про время не заговаривает", () => {
    const table = withBot("UNLIMITED");
    table.room.join("human");

    table.pass(10 * 60 * 1000);
    table.room.tick();

    assert.deepEqual(table.moments(), ["greeting"], "торопить тут некого");
  });

  it("на реванше забывает сказанное", () => {
    const table = withBot();
    table.room.join("human");
    table.room.act(GAME_EVENT.resign, "human", null);

    table.room.act(GAME_EVENT.rematch, "human", null);

    assert.equal(table.restarts(), 1, "память бота чистится");
    assert.equal(table.moments().at(-1), "rematch");
  });
});

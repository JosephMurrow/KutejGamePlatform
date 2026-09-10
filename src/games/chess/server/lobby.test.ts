import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameRoomContext, GameRoomEvent } from "@/lib/games/engine";
import { ChessLobby, LOBBY_SETTINGS } from "./lobby";

/**
 * Общий зал: одна комната, много досок.
 *
 * Главное, что тут проверяется, — что доски не путаются между собой: ход одной
 * пары не попадает в чужую партию, а снимок каждому приходит свой.
 */

function setup() {
  let at = 1000;
  const events: GameRoomEvent[] = [];
  const changes: number[] = [];

  const context: GameRoomContext = {
    key: "chess-lobby",
    ownerId: null,
    isPrivate: false,
    settings: LOBBY_SETTINGS,
    connections: () => 0,
    introduce: () => {},
    forget: () => {},
    emitted: (list) => events.push(...list),
    changed: () => changes.push(at),
  };

  const lobby = new ChessLobby(context, () => at);

  return {
    lobby,
    events,
    changes,
    pass: (ms: number) => {
      at += ms;
    },
    /** Игровая часть снимка глазами конкретного человека. */
    seen: (id: string) =>
      lobby.snapshot({ kind: "player", id }).extra as Record<string, unknown>,
  };
}

const move = (from: string, to: string, ply: number) => ({ from, to, ply });

describe("подбор в зале", () => {
  it("первый ждёт, второй садится с ним за доску", () => {
    const { lobby, seen } = setup();

    lobby.join("a");
    assert.equal(seen("a").phase, "queue");
    assert.equal(seen("a").queued, true);

    lobby.join("b");
    assert.equal(seen("a").phase, "playing");
    assert.equal(seen("b").phase, "playing");
    assert.equal(seen("a").queued, undefined, "за доской очередь ни при чём");
  });

  it("третий ждёт, пока не придёт четвёртый", () => {
    const { lobby, seen } = setup();

    for (const id of ["a", "b", "c"]) lobby.join(id);
    assert.equal(seen("c").phase, "queue");
    assert.deepEqual(seen("c").lobby, { waiting: 1, boards: 1, present: 3 });

    lobby.join("d");
    assert.equal(seen("c").phase, "playing");
    assert.deepEqual(seen("d").lobby, { waiting: 0, boards: 2, present: 4 });
  });

  it("выход из очереди снимает с ожидания", () => {
    const { lobby, seen } = setup();

    lobby.join("a");
    lobby.leave("a");
    lobby.join("b");

    assert.equal(seen("b").phase, "queue", "сажать не с кем");
    assert.deepEqual(seen("b").lobby, { waiting: 1, boards: 0, present: 1 });
  });
});

describe("доски не путаются", () => {
  it("ход одной пары не попадает в чужую партию", () => {
    const { lobby, seen } = setup();
    for (const id of ["a", "b", "c", "d"]) lobby.join(id);

    assert.deepEqual(lobby.act("game:move", "a", move("e2", "e4", 0)), {
      accepted: true,
    });

    assert.deepEqual(seen("a").moves, ["e4"]);
    assert.deepEqual(seen("b").moves, ["e4"], "соперник видит тот же ход");
    assert.deepEqual(seen("c").moves, [], "чужая доска не тронута");
    assert.deepEqual(seen("d").moves, []);
  });

  it("каждому приходит его партия, а не чужая", () => {
    const { lobby, seen } = setup();
    for (const id of ["a", "b", "c", "d"]) lobby.join(id);

    lobby.act("game:move", "a", move("d2", "d4", 0));
    lobby.act("game:move", "c", move("e2", "e4", 0));

    assert.deepEqual(seen("a").moves, ["d4"]);
    assert.deepEqual(seen("c").moves, ["e4"]);
  });

  it("не за доской ходить нельзя", () => {
    const { lobby } = setup();
    lobby.join("a");

    assert.deepEqual(lobby.act("game:move", "a", move("e2", "e4", 0)), {
      accepted: false,
      reason: "Ты ещё не за доской",
    });
  });
});

describe("часы зала", () => {
  it("дедлайн — ближайший из всех досок", () => {
    const { lobby, pass } = setup();
    lobby.join("a");
    lobby.join("b");
    const first = lobby.deadline();

    // Вторая пара садится позже, значит её срок дальше.
    pass(5000);
    lobby.join("c");
    lobby.join("d");

    assert.ok(first !== null);
    assert.ok(
      (lobby.deadline() ?? 0) <= (first ?? 0) + 1,
      "зал ждёт того, у кого срок ближе",
    );
  });

  it("флаг кончает только свою партию", () => {
    const { lobby, pass, seen } = setup();
    for (const id of ["a", "b", "c", "d"]) lobby.join(id);

    // Первая пара молчит и просрочивает; вторая успевает сходить.
    pass(29_000);
    lobby.act("game:move", "c", move("e2", "e4", 0));
    pass(2000);
    lobby.tick();

    assert.equal(seen("a").phase, "over", "своя партия кончилась");
    assert.equal(seen("a").reason, "flag");
    assert.equal(seen("c").phase, "playing", "чужая партия не тронута");
  });
});

describe("после партии", () => {
  it("доигранная доска остаётся на экране у обоих", () => {
    const { lobby, seen } = setup();
    lobby.join("a");
    lobby.join("b");
    lobby.act("game:move", "a", move("e2", "e4", 0));
    lobby.act("game:resign", "a", null);

    // Убрать доску сразу значит не показать человеку, чем кончилась партия:
    // следующим же снимком он оказался бы в очереди, без итога и без кнопки.
    assert.equal(seen("a").phase, "over");
    assert.equal(seen("a").result, "black");
    assert.equal(seen("b").phase, "over", "сопернику тоже");
    assert.deepEqual(
      seen("a").lobby,
      { waiting: 0, boards: 0, present: 2 },
      "идущей партией она при этом не считается",
    );
  });

  it("доигранную доску убирают, когда оба разошлись", () => {
    const { lobby, seen } = setup();
    lobby.join("a");
    lobby.join("b");
    lobby.act("game:move", "a", move("e2", "e4", 0));
    lobby.act("game:resign", "a", null);

    lobby.leave("a");
    lobby.leave("b");
    lobby.join("a");

    assert.equal(seen("a").phase, "queue", "вернулся — стоит в очереди");
    assert.equal(seen("a").queued, true);
  });

  it("«ещё партия» ставит обратно в очередь", () => {
    const { lobby, seen } = setup();
    lobby.join("a");
    lobby.join("b");
    lobby.act("game:move", "a", move("e2", "e4", 0));
    lobby.act("game:resign", "a", null);

    assert.deepEqual(lobby.act("game:rematch", "a", null), { accepted: true });
    assert.equal(seen("a").queued, true);

    lobby.act("game:rematch", "b", null);
    assert.equal(seen("a").phase, "playing", "оба захотели — сели снова");
  });

  it("в зале никого не выгоняют", () => {
    const { lobby } = setup();
    lobby.join("a");

    assert.deepEqual(lobby.remove(), {
      accepted: false,
      reason: "В общем зале никого не выгоняют",
    });
  });
});

describe("жеребьёвка цвета", () => {
  it("во второй партии цвета меняются", () => {
    const { lobby, seen } = setup();
    lobby.join("a");
    lobby.join("b");

    const firstWhite = seen("a").turn === "white" ? "a" : "b";
    const white = (id: string) =>
      (
        lobby.snapshot({ kind: "player", id }).players.find((p) => p.id === id)
          ?.extra as { color?: string }
      )?.color;

    assert.equal(white(firstWhite), "white");

    // Партия кончилась, оба снова в очередь: цвет должен смениться.
    lobby.act("game:move", firstWhite, { from: "e2", to: "e4", ply: 0 });
    lobby.act("game:resign", firstWhite, null);
    lobby.act("game:rematch", "a", null);
    lobby.act("game:rematch", "b", null);

    assert.equal(
      white(firstWhite),
      "black",
      "шесть чёрных подряд — не случайность, а ощущение подставы",
    );
  });
});

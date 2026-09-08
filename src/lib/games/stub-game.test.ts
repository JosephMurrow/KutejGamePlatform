import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";
import { RoomManager, type ManagedRoom, type RoomSetup } from "@/server/rooms";
import type { SocketUser } from "@/server/auth";
import type {
  GameRoomContext,
  GameRoomSnapshot,
  GameRoomState,
  GameServer,
  GameViewer,
} from "./engine";

/**
 * Болванка-игра: две фазы, одно действие, счёт из воздуха. Она ничего не знает
 * ни про ставки, ни про вопросы — и в этом весь смысл.
 *
 * Правило импортов ловит `import`, но не ловит главного: что интерфейс движка
 * получился формой платитутки под общим названием. Проверить это можно только
 * второй игрой, и пока настоящей нет, её изображает болванка. Метод, который
 * ей нечем заполнить или который приходится затыкать заглушкой из чужой
 * предметной области, стоит не на своём месте (docs/BACKLOG.md A7).
 */
class StubRoom implements GameRoomState {
  private readonly players: string[] = [];
  private readonly clicks = new Map<string, number>();
  /** Своя выдумка: фаза, которой платформа знать не должна. */
  private phase: "waiting" | "clicking" | "done" = "waiting";
  /** Своё время: платформа только заводит по нему будильник. */
  private deadlineAt: number | null = null;
  /** Сколько раз платформа будила движок. */
  ticks = 0;

  constructor(private readonly context: GameRoomContext) {}

  join(playerId: string): void {
    if (!this.players.includes(playerId)) this.players.push(playerId);
    if (this.players.length >= 2) {
      this.phase = "clicking";
      this.deadlineAt = Date.now() + 5000;
    }
    this.context.changed();
  }

  leave(playerId: string): void {
    const at = this.players.indexOf(playerId);
    if (at >= 0) this.players.splice(at, 1);
    if (this.players.length < 2) this.phase = "waiting";
    this.context.changed();
  }

  seated(): readonly string[] {
    return this.players;
  }

  deadline(): number | null {
    return this.deadlineAt;
  }

  tick(): void {
    this.ticks += 1;
    this.phase = "done";
    this.deadlineAt = null;
    this.context.emitted([{ type: "stub_finished", clicks: this.clicks.size }]);
    this.context.changed();
  }

  act(event: string, actorId: string): { accepted: boolean; reason?: string } {
    if (event !== "stub:click") {
      return { accepted: false, reason: "Неизвестное действие" };
    }
    if (this.phase !== "clicking") {
      return { accepted: false, reason: "Ещё не начали" };
    }

    this.clicks.set(actorId, (this.clicks.get(actorId) ?? 0) + 1);
    this.context.changed();

    return { accepted: true };
  }

  remove(
    actorId: string,
    targetId: string,
  ): { accepted: boolean; reason?: string } {
    if (this.context.ownerId !== actorId) {
      return { accepted: false, reason: "Выгоняет только хозяин" };
    }

    this.leave(targetId);
    return { accepted: true };
  }

  snapshot(viewer: GameViewer): GameRoomSnapshot {
    return {
      deadline: null,
      phaseDurationMs: null,
      playerCount: this.players.length,
      players: this.players.map((id) => ({
        id,
        extra: { clicks: this.clicks.get(id) ?? 0 },
      })),
      extra: {
        phase: this.phase,
        // Секрет виден только своему: экран не знает его никогда.
        secret: viewer.kind === "screen" ? null : `для ${viewer.id}`,
      },
    };
  }

  settled(): Promise<void> {
    return Promise.resolve();
  }

  stop(): void {}
}

class StubServer implements GameServer {
  readonly rooms = new Map<string, StubRoom>();

  createRoom(context: GameRoomContext): Promise<GameRoomState> {
    const room = new StubRoom(context);
    this.rooms.set(context.key, room);
    return Promise.resolve(room);
  }

  closeRoom(key: string): void {
    this.rooms.delete(key);
  }

  stop(): void {
    this.rooms.clear();
  }
}

function player(id: string, nickname: string): SocketUser {
  return { id, nickname, avatarId: 3, guestRoomId: null };
}

const SETUP: RoomSetup = {
  gameId: "stub",
  // Приватная комната ходит в базу за отметками занятости — болванке это ни к
  // чему, поэтому стол общий.
  isPrivate: false,
  kind: "private",
  title: null,
  ownerId: null,
  locked: false,
  maxPlayers: null,
  twitchChannel: null,
  settings: {},
};

function setup() {
  const sent: ManagedRoom[] = [];
  const server = new StubServer();
  const manager = new RoomManager(
    (room) => sent.push(room),
    () => server,
  );

  return { manager, server, sent };
}

describe("платформа с болванкой вместо игры", () => {
  it("поднимает комнату и сажает игроков, не зная правил", async () => {
    const { manager } = setup();

    await manager.join(player("a", "Аня"), "stub-room", SETUP);
    const managed = await manager.join(player("b", "Боря"), "stub-room", SETUP);

    assert.deepEqual([...managed.game.seated()], ["a", "b"]);
    assert.equal(managed.profiles.get("a")?.nickname, "Аня");
    assert.equal(managed.connections.size, 2);
  });

  it("передаёт действие движку и не разбирается, что оно значит", async () => {
    const { manager } = setup();

    await manager.join(player("a", "Аня"), "stub-room", SETUP);
    const managed = await manager.join(player("b", "Боря"), "stub-room", SETUP);

    assert.deepEqual(await managed.game.act("stub:click", "a", null), {
      accepted: true,
    });

    const outcome = await managed.game.act("round:bet", "a", { bet: 100 });
    assert.equal(outcome.accepted, false);
  });

  it("собирает снимок из своей части и игровой", async () => {
    const { manager } = setup();

    await manager.join(player("a", "Аня"), "stub-room", SETUP);
    const managed = await manager.join(player("b", "Боря"), "stub-room", SETUP);
    await managed.game.act("stub:click", "b", null);

    const snapshot = managed.game.snapshot({ kind: "player", id: "b" });

    assert.equal(snapshot.playerCount, 2);
    assert.equal(snapshot.extra.phase, "clicking");
    assert.deepEqual(
      snapshot.players.map((entry) => entry.extra.clicks),
      [0, 1],
    );
  });

  it("экран не получает того, что видно игроку", async () => {
    const { manager } = setup();

    await manager.join(player("a", "Аня"), "stub-room", SETUP);
    const managed = await manager.join(player("b", "Боря"), "stub-room", SETUP);

    assert.equal(managed.game.snapshot({ kind: "screen" }).extra.secret, null);
    assert.equal(
      managed.game.snapshot({ kind: "player", id: "a" }).extra.secret,
      "для a",
    );
  });

  it("рассылает, когда движок говорит, что поменялось", async () => {
    const { manager, sent } = setup();

    await manager.join(player("a", "Аня"), "stub-room", SETUP);
    const before = sent.length;

    const managed = manager.get("stub-room");
    assert.ok(managed);
    await managed.game.act("stub:click", "a", null);

    assert.ok(sent.length >= before, "рассылка не остановилась");
  });

  it("заводит будильник по дедлайну движка и будит его", async (t: TestContext) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { manager } = setup();

    await manager.join(player("a", "Аня"), "stub-room", SETUP);
    const managed = await manager.join(player("b", "Боря"), "stub-room", SETUP);
    const room = managed.game as StubRoom;

    assert.equal(room.ticks, 0, "будить раньше срока нельзя");
    assert.notEqual(managed.game.deadline(), null, "движок ждёт побудки");

    t.mock.timers.tick(5000);

    assert.equal(room.ticks, 1, "платформа разбудила движок");
    assert.equal(managed.game.snapshot({ kind: "screen" }).extra.phase, "done");
    assert.equal(managed.game.deadline(), null, "часы остановились");
  });

  it("после закрытия комнаты будильник не срабатывает", async (t: TestContext) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { manager } = setup();

    await manager.join(player("a", "Аня"), "stub-room", SETUP);
    const managed = await manager.join(player("b", "Боря"), "stub-room", SETUP);
    const room = managed.game as StubRoom;

    manager.close("stub-room");
    t.mock.timers.tick(5000 * 3);

    assert.equal(room.ticks, 0, "погашенная комната не просыпается");
  });

  it("пересказывает события партии подписчикам", async (t: TestContext) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { manager } = setup();

    const heard: { key: string; type: string }[] = [];
    const off = manager.onEvents((key, events) => {
      for (const event of events) heard.push({ key, type: event.type });
    });

    await manager.join(player("a", "Аня"), "stub-room", SETUP);
    await manager.join(player("b", "Боря"), "stub-room", SETUP);
    t.mock.timers.tick(5000);

    assert.deepEqual(heard, [{ key: "stub-room", type: "stub_finished" }]);

    // Отписка возвращается вызовом — после неё слушателя больше нет.
    off();
  });

  it("гасит комнату и сообщает об этом игре", async () => {
    const { manager, server } = setup();

    await manager.join(player("a", "Аня"), "stub-room", SETUP);
    assert.equal(server.rooms.size, 1);

    manager.close("stub-room");

    assert.equal(server.rooms.size, 0);
    assert.equal(manager.get("stub-room"), undefined);
  });
});

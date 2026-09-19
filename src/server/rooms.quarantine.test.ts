import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  GameRoomContext,
  GameRoomSnapshot,
  GameRoomState,
  GameServer,
} from "@/lib/games/engine";
import type { SocketUser } from "./auth";
import { RoomManager, type RoomSetup } from "./rooms";

/**
 * Карантин комнаты (docs/SECURITY.md, S-E4, уровень 2).
 *
 * Раньше исключение из `tick` уходило мимо всего: будильник уже удалён,
 * новый не заводится, фаза не сменится никогда — комната застывала до
 * перезапуска сервера. Теперь сломанная комната закрывается, соседние живут,
 * а следующий вход поднимает её заново.
 */

class Game implements GameRoomState {
  private readonly players: string[] = [];

  constructor(
    private readonly context: GameRoomContext,
    private readonly broken: { tick: boolean; join: boolean },
  ) {}

  join(id: string): void {
    if (this.broken.join) throw new Error("движок сломался на входе");
    this.players.push(id);
  }
  leave(id: string): void {
    this.players.splice(this.players.indexOf(id), 1);
  }
  seated(): readonly string[] {
    return this.players;
  }
  deadline(): number | null {
    return Date.now() + 10;
  }
  tick(): void {
    if (this.broken.tick) throw new Error("движок сломался на будильнике");
  }
  act() {
    return { accepted: true };
  }
  remove() {
    return { accepted: true };
  }
  snapshot(): GameRoomSnapshot {
    return {
      deadline: null,
      phaseDurationMs: null,
      playerCount: this.players.length,
      players: [],
      extra: {},
    };
  }
  settled(): Promise<void> {
    return Promise.resolve();
  }
  stop(): void {}
}

function setup(broken: (key: string) => { tick: boolean; join: boolean }) {
  const created: string[] = [];
  const server: GameServer = {
    createRoom(context) {
      created.push(context.key);
      return Promise.resolve(new Game(context, broken(context.key)));
    },
    stop() {},
  };
  const manager = new RoomManager(
    () => {},
    () => server,
  );
  const quarantined: string[] = [];
  manager.onQuarantine((key) => quarantined.push(key));
  return { manager, created, quarantined };
}

const SETUP: RoomSetup = {
  gameId: "stub",
  // Общий стол: приватная комната пошла бы в базу за отметками занятости.
  isPrivate: false,
  kind: "private",
  title: null,
  ownerId: null,
  locked: false,
  maxPlayers: null,
  twitchChannel: null,
  settings: {},
};

const user = (id: string): SocketUser => ({
  id,
  nickname: id,
  avatarId: 1,
  guestRoomId: null,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("карантин комнаты", () => {
  it("исключение в будильнике закрывает только эту комнату", async (t) => {
    t.mock.method(console, "error", () => {});
    const brokenTick = new Set(["broken"]);
    const { manager, quarantined } = setup((key) => ({
      tick: brokenTick.has(key),
      join: false,
    }));

    await manager.join(user("a"), "broken", SETUP);
    await manager.join(user("b"), "healthy", SETUP);
    await sleep(60);

    assert.deepEqual(quarantined, ["broken"]);
    assert.equal(manager.get("broken"), undefined, "сломанная закрыта");
    assert.ok(manager.get("healthy"), "соседняя живёт");
  });

  it("следующий вход поднимает комнату заново", async (t) => {
    t.mock.method(console, "error", () => {});
    let broken = true;
    const { manager, created } = setup(() => ({ tick: broken, join: false }));

    await manager.join(user("a"), "room", SETUP);
    await sleep(60);
    assert.equal(manager.get("room"), undefined);

    broken = false;
    const fresh = await manager.join(user("a"), "room", SETUP);
    assert.deepEqual(created, ["room", "room"], "поднята вторая партия");
    assert.deepEqual([...fresh.game.seated()], ["a"]);
  });

  it("исключение на входе — тоже карантин, а не падение", async (t) => {
    t.mock.method(console, "error", () => {});
    const { manager, quarantined } = setup(() => ({ tick: false, join: true }));

    await manager.join(user("a"), "room", SETUP);

    assert.deepEqual(quarantined, ["room"]);
    assert.equal(manager.get("room"), undefined);
  });

  it("сбой пишется с меткой уровня и ключом комнаты", async (t) => {
    const lines: string[] = [];
    t.mock.method(console, "error", (line: unknown) => {
      lines.push(String(line));
    });
    const { manager } = setup(() => ({ tick: true, join: false }));

    await manager.join(user("a"), "room-x", SETUP);
    await sleep(60);

    assert.ok(
      lines.some(
        (line) =>
          line.startsWith("[сбой:2] комната: будильник") &&
          line.includes('"room":"room-x"'),
      ),
      lines.join("\n"),
    );
  });
});

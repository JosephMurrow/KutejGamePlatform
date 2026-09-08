import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";
import {
  DEFAULT_TIMINGS,
  Room,
  type QuestionSource,
  type RoomView,
} from "./room";
import { RoomRunner } from "./runner";

class FakeQuestions implements QuestionSource {
  readonly burned: string[] = [];
  private counter = 0;

  next(): string | null {
    this.counter += 1;
    return `q${this.counter}`;
  }

  burn(id: string): void {
    this.burned.push(id);
  }
}

/** Управляемые часы: время двигаем руками вместе с таймерами теста. */
function testClock(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout"] });

  let value = 0;
  return {
    now: () => value,
    advance(ms: number) {
      value += ms;
      t.mock.timers.tick(ms);
    },
  };
}

function setup(t: TestContext) {
  const clock = testClock(t);
  const room = new Room("test", new FakeQuestions());
  const views: RoomView[] = [];

  const runner = new RoomRunner(
    room,
    (_events, view) => views.push(view),
    clock.now,
  );

  return { clock, room, runner, views };
}

describe("RoomRunner", () => {
  it("рассылает состояние после принятого действия", (t) => {
    const { runner, views } = setup(t);

    runner.run((room, now) => room.join("аня", now));
    runner.run((room, now) => room.join("боря", now));

    assert.equal(views.length, 2);
    assert.equal(views.at(-1)?.phase, "ready");
  });

  it("молчит, если действие отклонено", (t) => {
    const { runner, views } = setup(t);

    runner.run((room, now) => room.join("аня", now));
    runner.run((room, now) => room.join("боря", now));
    const before = views.length;

    const result = runner.run((room, now) => room.confirmRead("боря", now));

    assert.equal(result.accepted, false);
    assert.equal(views.length, before, "отказ не должен обновлять всех");
  });

  it("сам переводит фазу, когда дедлайн вышел", (t) => {
    const { clock, runner, views } = setup(t);

    runner.run((room, now) => room.join("аня", now));
    runner.run((room, now) => room.join("боря", now));
    assert.equal(views.at(-1)?.phase, "ready");

    // Ведущий молчит все двадцать секунд — раунд должен уйти следующему.
    clock.advance(DEFAULT_TIMINGS.readyMs);

    const latest = views.at(-1);
    assert.equal(latest?.phase, "ready");
    assert.equal(latest?.hostId, "боря");
  });

  it("докручивает цикл до вскрышки и следующего раунда", (t) => {
    const { clock, runner, views } = setup(t);

    runner.run((room, now) => room.join("аня", now));
    runner.run((room, now) => room.join("боря", now));
    runner.run((room, now) => room.confirmRead("аня", now));
    runner.run((room, now) => room.submitHostAnswer("аня", 1000, now));
    runner.run((room, now) => room.placeBet("боря", 900, now));

    assert.equal(views.at(-1)?.phase, "reveal");

    clock.advance(DEFAULT_TIMINGS.revealMs);

    assert.equal(views.at(-1)?.phase, "ready");
    assert.equal(views.at(-1)?.hostId, "боря");
  });

  it("после stop таймеры больше не срабатывают", (t) => {
    const { clock, runner, views } = setup(t);

    runner.run((room, now) => room.join("аня", now));
    runner.run((room, now) => room.join("боря", now));
    const before = views.length;

    runner.stop();
    clock.advance(DEFAULT_TIMINGS.readyMs * 3);

    assert.equal(views.length, before);
  });
});

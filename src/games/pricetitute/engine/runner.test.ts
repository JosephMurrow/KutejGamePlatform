import assert from "node:assert/strict";
import { describe, it } from "node:test";
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

/**
 * Управляемые часы. Таймеров тут больше нет: будильник по дедлайну заводит
 * платформа, а движок будят вызовом `tick` — его тест и делает руками.
 */
function testClock() {
  let value = 0;
  return {
    now: () => value,
    advance(ms: number) {
      value += ms;
    },
  };
}

function setup() {
  const clock = testClock();
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
  it("рассылает состояние после принятого действия", () => {
    const { runner, views } = setup();

    runner.run((room, now) => room.join("аня", now));
    runner.run((room, now) => room.join("боря", now));

    assert.equal(views.length, 2);
    assert.equal(views.at(-1)?.phase, "ready");
  });

  it("молчит, если действие отклонено", () => {
    const { runner, views } = setup();

    runner.run((room, now) => room.join("аня", now));
    runner.run((room, now) => room.join("боря", now));
    const before = views.length;

    const result = runner.run((room, now) => room.confirmRead("боря", now));

    assert.equal(result.accepted, false);
    assert.equal(views.length, before, "отказ не должен обновлять всех");
  });

  it("переводит фазу, когда его будят", () => {
    const { clock, runner, views } = setup();

    runner.run((room, now) => room.join("аня", now));
    runner.run((room, now) => room.join("боря", now));
    assert.equal(views.at(-1)?.phase, "ready");

    // Ведущий молчит все двадцать секунд — раунд должен уйти следующему.
    clock.advance(DEFAULT_TIMINGS.readyMs);
    runner.tick(clock.now());

    const latest = views.at(-1);
    assert.equal(latest?.phase, "ready");
    assert.equal(latest?.hostId, "боря");
  });

  it("докручивает цикл до вскрышки и следующего раунда", () => {
    const { clock, runner, views } = setup();

    runner.run((room, now) => room.join("аня", now));
    runner.run((room, now) => room.join("боря", now));
    runner.run((room, now) => room.confirmRead("аня", now));
    runner.run((room, now) => room.submitHostAnswer("аня", 1000, now));
    runner.run((room, now) => room.placeBet("боря", 900, now));

    assert.equal(views.at(-1)?.phase, "reveal");

    clock.advance(DEFAULT_TIMINGS.revealMs);
    runner.tick(clock.now());

    assert.equal(views.at(-1)?.phase, "ready");
    assert.equal(views.at(-1)?.hostId, "боря");
  });

  it("после stop не принимает ни ходов, ни побудок", () => {
    const { clock, runner, views } = setup();

    runner.run((room, now) => room.join("аня", now));
    runner.run((room, now) => room.join("боря", now));
    const before = views.length;

    runner.stop();

    const result = runner.run((room, now) => room.confirmRead("аня", now));
    clock.advance(DEFAULT_TIMINGS.readyMs);
    runner.tick(clock.now());

    assert.equal(result.accepted, false, "закрытая комната ходов не берёт");
    assert.equal(views.length, before, "и ничего не рассылает");
  });
});

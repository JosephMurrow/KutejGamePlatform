import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NEVER } from "./bet";
import {
  DEFAULT_TIMINGS,
  Room,
  type GameEvent,
  type QuestionSource,
} from "./room";

/** Выдаёт вопросы по порядку и запоминает сгоревшие. */
class FakeQuestions implements QuestionSource {
  readonly burned: string[] = [];
  private counter = 0;

  constructor(private readonly limit = Infinity) {}

  next(): string | null {
    if (this.counter >= this.limit) return null;
    this.counter += 1;
    return `q${this.counter}`;
  }

  burn(id: string): void {
    this.burned.push(id);
  }
}

const T = DEFAULT_TIMINGS;

/** Комната с двумя игроками и уже запущенным первым раундом. */
function startedRoom(questions = new FakeQuestions()) {
  const room = new Room("test", questions);
  room.join("аня", 0);
  room.join("боря", 0);
  return { room, questions };
}

/** Провести раунд до вскрышки: ведущий читает, отвечает, игрок ставит. */
function playRound(
  room: Room,
  hostId: string,
  hostBet: Parameters<Room["submitHostAnswer"]>[1],
  bets: Record<string, Parameters<Room["placeBet"]>[1]>,
  at = 1000,
): GameEvent[] {
  room.confirmRead(hostId, at);
  room.submitHostAnswer(hostId, hostBet, at);

  let events: GameEvent[] = [];
  for (const [playerId, bet] of Object.entries(bets)) {
    events = room.placeBet(playerId, bet, at).events;
  }
  return events;
}

describe("Room: запуск и круг ходов", () => {
  it("ждёт второго игрока и не начинает раунд в одиночку", () => {
    const room = new Room("test", new FakeQuestions());
    const result = room.join("аня", 0);

    assert.deepEqual(result.events, [
      { type: "paused", reason: "not_enough_players" },
    ]);
    assert.equal(room.view().phase, "waiting");
  });

  it("стартует раунд, как только игроков стало двое", () => {
    const { room } = startedRoom();
    const view = room.view();

    assert.equal(view.phase, "ready");
    assert.equal(view.hostId, "аня");
    assert.equal(view.questionId, "q1");
    assert.equal(view.deadline, T.readyMs);
  });

  it("передаёт ход следующему по кругу", () => {
    const { room } = startedRoom();

    playRound(room, "аня", 1000, { боря: 900 });
    room.tick(1000 + T.revealMs);
    assert.equal(room.view().hostId, "боря");

    playRound(room, "боря", 500, { аня: 400 }, 2000);
    room.tick(2000 + T.revealMs);
    assert.equal(room.view().hostId, "аня");
  });

  it("встаёт на паузу, если вопросы в пуле кончились", () => {
    const { room } = startedRoom(new FakeQuestions(1));

    playRound(room, "аня", 1000, { боря: 900 });
    const events = room.tick(1000 + T.revealMs);

    assert.deepEqual(events, [{ type: "paused", reason: "no_questions" }]);
    assert.equal(room.view().phase, "waiting");
  });
});

describe("Room: фаза READY", () => {
  it("прячет вопрос от всех, кроме ведущего", () => {
    const { room } = startedRoom();
    assert.equal(room.view().questionVisibleToAll, false);
  });

  it("открывает вопрос всем после «Прочитал»", () => {
    const { room } = startedRoom();
    room.confirmRead("аня", 100);

    const view = room.view();
    assert.equal(view.phase, "host_answer");
    assert.equal(view.questionVisibleToAll, true);
    assert.equal(view.deadline, 100 + T.hostAnswerMs);
  });

  it("не даёт нажать «Прочитал» не ведущему", () => {
    const { room } = startedRoom();
    const result = room.confirmRead("боря", 100);

    assert.equal(result.accepted, false);
    assert.equal(room.view().phase, "ready");
  });

  it("сжигает вопрос и передаёт ход, если ведущий промолчал", () => {
    const { room, questions } = startedRoom();
    const events = room.tick(T.readyMs);

    assert.deepEqual(questions.burned, ["q1"]);
    assert.equal(events[0]?.type, "round_aborted");
    assert.equal(room.view().hostId, "боря");
    assert.equal(room.view().questionId, "q2");
  });
});

describe("Room: фаза ответа ведущего", () => {
  it("сжигает вопрос, если ведущий не успел ввести сумму", () => {
    const { room, questions } = startedRoom();
    room.confirmRead("аня", 100);

    const events = room.tick(100 + T.hostAnswerMs);

    assert.deepEqual(questions.burned, ["q1"]);
    assert.equal(
      events.find((event) => event.type === "round_aborted")?.type,
      "round_aborted",
    );
    assert.equal(room.view().hostId, "боря");
  });

  it("открывает ставки после ответа ведущего", () => {
    const { room } = startedRoom();
    room.confirmRead("аня", 100);
    room.submitHostAnswer("аня", 5000, 200);

    const view = room.view();
    assert.equal(view.phase, "betting");
    assert.equal(view.deadline, 200 + T.bettingMs);
    assert.equal(
      view.reveal,
      null,
      "ответ ведущего не должен утечь до вскрышки",
    );
  });
});

describe("Room: ставки", () => {
  it("не показывает ставки до вскрышки", () => {
    const room = new Room("test", new FakeQuestions());
    room.join("аня", 0);
    room.join("боря", 0);
    room.join("вера", 0);

    room.confirmRead("аня", 100);
    room.submitHostAnswer("аня", 5000, 100);
    room.placeBet("боря", 4000, 200);

    const view = room.view();
    assert.equal(view.reveal, null);
    assert.equal(view.players.find((p) => p.id === "боря")?.hasBet, true);
    assert.equal(view.players.find((p) => p.id === "вера")?.hasBet, false);
  });

  it("не даёт менять ставку", () => {
    // Третий игрок нужен, чтобы фаза не закрылась после первой же ставки.
    const room = new Room("test", new FakeQuestions());
    room.join("аня", 0);
    room.join("боря", 0);
    room.join("вера", 0);

    room.confirmRead("аня", 100);
    room.submitHostAnswer("аня", 5000, 100);

    assert.equal(room.placeBet("боря", 4000, 200).accepted, true);
    const second = room.placeBet("боря", 9000, 300);

    assert.equal(second.accepted, false);
    assert.match(second.reason ?? "", /уже сделана/);
  });

  it("не даёт ведущему ставить в своём раунде", () => {
    const { room } = startedRoom();
    room.confirmRead("аня", 100);
    room.submitHostAnswer("аня", 5000, 100);

    assert.equal(room.placeBet("аня", 5000, 200).accepted, false);
  });

  it("закрывает ставки досрочно, когда поставили все", () => {
    const { room } = startedRoom();
    room.confirmRead("аня", 100);
    room.submitHostAnswer("аня", 5000, 100);

    const events = room.placeBet("боря", 4000, 200).events;

    assert.equal(events[0]?.type, "round_resolved");
    assert.equal(room.view().phase, "reveal");
    assert.equal(room.view().deadline, 200 + T.revealMs);
  });

  it("подводит итог по таймеру, даже если кто-то не поставил", () => {
    const room = new Room("test", new FakeQuestions());
    room.join("аня", 0);
    room.join("боря", 0);
    room.join("вера", 0);

    room.confirmRead("аня", 100);
    room.submitHostAnswer("аня", 5000, 100);
    room.placeBet("боря", 4000, 200);

    const events = room.tick(100 + T.bettingMs);

    assert.equal(events[0]?.type, "round_resolved");
    assert.equal(room.view().phase, "reveal");
  });
});

describe("Room: очки", () => {
  it("даёт очко ближайшему и ничего не даёт ведущему", () => {
    const room = new Room("test", new FakeQuestions());
    room.join("аня", 0);
    room.join("боря", 0);
    room.join("вера", 0);

    // Боря промахивается в 1.3 раза и укладывается в порог, Вера мимо в
    // десять раз — очко достаётся Боре.
    playRound(room, "аня", 100_000, { боря: 130_000, вера: 10_000 });

    const view = room.view();
    assert.deepEqual(view.reveal?.winners, ["боря"]);
    assert.equal(view.players.find((p) => p.id === "боря")?.score, 1);
    assert.equal(view.players.find((p) => p.id === "вера")?.score, 0);
    assert.equal(view.players.find((p) => p.id === "аня")?.score, 0);
  });

  it("оставляет раунд без победителя, если промахнулись все", () => {
    const room = new Room("test", new FakeQuestions());
    room.join("аня", 0);
    room.join("боря", 0);
    room.join("вера", 0);

    playRound(room, "аня", 100_000, { боря: 300_000, вера: 10_000 });

    const view = room.view();
    assert.deepEqual(view.reveal?.winners, []);
    assert.ok(view.players.every((player) => player.score === 0));
  });

  it("отдаёт в событии полный раунд для сохранения", () => {
    const { room } = startedRoom();
    const events = playRound(room, "аня", NEVER, { боря: NEVER });

    const resolved = events.find((event) => event.type === "round_resolved");
    assert.ok(resolved && resolved.type === "round_resolved");
    assert.equal(resolved.record.questionId, "q1");
    assert.equal(resolved.record.hostId, "аня");
    assert.equal(resolved.record.hostAnswer, NEVER);
    assert.deepEqual(resolved.record.outcome.winners, ["боря"]);
  });

  it("считает сыгранные раунды ведущему и тем, кто поставил", () => {
    const { room } = startedRoom();
    playRound(room, "аня", 1000, { боря: 900 });

    const view = room.view();
    assert.equal(view.players.find((p) => p.id === "аня")?.roundsPlayed, 1);
    assert.equal(view.players.find((p) => p.id === "боря")?.roundsPlayed, 1);
  });
});

describe("Room: отключения", () => {
  it("аннулирует раунд, если ушёл ведущий", () => {
    const room = new Room("test", new FakeQuestions());
    room.join("аня", 0);
    room.join("боря", 0);
    room.join("вера", 0);
    room.confirmRead("аня", 100);

    const { events } = room.leave("аня", 200);

    assert.equal(
      events.find((event) => event.type === "round_aborted")?.type,
      "round_aborted",
    );
    assert.notEqual(room.view().hostId, "аня");
  });

  it("засчитывает ставку игрока, который потом отключился", () => {
    const room = new Room("test", new FakeQuestions());
    room.join("аня", 0);
    room.join("боря", 0);
    room.join("вера", 0);

    room.confirmRead("аня", 100);
    room.submitHostAnswer("аня", 1000, 100);
    room.placeBet("боря", 1000, 200);
    room.leave("боря", 300);

    // Осталась только Вера, она ставит — раунд закрывается со ставкой Бори.
    room.placeBet("вера", 10, 400);

    assert.deepEqual(room.view().reveal?.winners, ["боря"]);
  });

  it("встаёт на паузу и сжигает вопрос, когда остался один игрок", () => {
    const { room, questions } = startedRoom();
    room.confirmRead("аня", 100);

    const { events } = room.leave("боря", 200);

    assert.deepEqual(events, [
      { type: "paused", reason: "not_enough_players" },
    ]);
    assert.equal(room.view().phase, "waiting");
    assert.deepEqual(questions.burned, ["q1"]);
  });

  it("возобновляет игру, когда второй игрок вернулся", () => {
    const { room } = startedRoom();
    room.leave("боря", 100);
    assert.equal(room.view().phase, "waiting");

    room.join("витя", 200);

    assert.equal(room.view().phase, "ready");
    assert.equal(room.view().deadline, 200 + T.readyMs);
  });

  it("пускает нового игрока делать ставку в идущем раунде", () => {
    const { room } = startedRoom();
    room.confirmRead("аня", 100);
    room.submitHostAnswer("аня", 1000, 100);

    room.join("вера", 150);

    assert.equal(room.placeBet("вера", 1200, 200).accepted, true);
  });
});

describe("Room: таймеры", () => {
  it("не трогает состояние, пока дедлайн не наступил", () => {
    const { room } = startedRoom();

    assert.deepEqual(room.tick(T.readyMs - 1), []);
    assert.equal(room.view().phase, "ready");
  });

  it("на паузе тик ничего не делает", () => {
    const room = new Room("test", new FakeQuestions());
    room.join("аня", 0);

    assert.deepEqual(room.tick(1_000_000), []);
    assert.equal(room.view().phase, "waiting");
  });
});

describe("Ответ ведущего наружу не уходит", () => {
  it("в снимке комнаты его нет до самой вскрышки", () => {
    const { room } = startedRoom();
    room.confirmRead("аня", 0);
    room.submitHostAnswer("аня", 123_456, 0);

    const снимок = JSON.stringify(room.view());

    assert.equal(
      снимок.includes("123456"),
      false,
      "сумма ведущего просочилась в состояние",
    );
    assert.equal(room.view().reveal, null);
  });

  it("серверный доступ её при этом отдаёт — на этом стоят боты", () => {
    const { room } = startedRoom();
    room.confirmRead("аня", 0);
    room.submitHostAnswer("аня", 123_456, 0);

    assert.equal(room.peekHostAnswer(), 123_456);
  });

  it("до ответа ведущего отдавать нечего", () => {
    const { room } = startedRoom();
    assert.equal(room.peekHostAnswer(), null);
  });
});

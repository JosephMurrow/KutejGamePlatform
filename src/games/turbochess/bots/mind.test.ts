import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TurboGame } from "../engine/game";
import { classicPosition, type Position } from "../engine/position";
import { MODES, type TurboMode } from "../modes/catalog";
import { isReady, modeOptions, startPosition } from "../modes/rules";
import { roller } from "../modes/random";
import { reinforcementsPosition } from "../modes/reinforcements";
import { CHARACTER_TRAITS } from "./characters";
import { LEVELS } from "./levels";
import { think } from "./mind";
import { MAX_PAUSE_MS, MIN_PAUSE_MS } from "./tempo";

/**
 * Голова бота целиком. Главная проверка здесь одна, но важная: бот играет во
 * всех готовых режимах и отдаёт ход в той же форме, что человек, — потому что
 * ходы он берёт у движка и про режимы не знает ничего.
 */

const SEED = 4242;

function setup(mode: TurboMode): Position {
  return startPosition(
    mode,
    modeOptions(mode, () => undefined),
    SEED,
  );
}

function ask(position: Position, level = LEVELS.normal, drinks = 0) {
  return think({
    position,
    seat: position.turn,
    level,
    traits: CHARACTER_TRAITS.physicist,
    ply: 0,
    drinks,
    roll: roller(SEED, position.turn),
  });
}

describe("бот выбирает ход", () => {
  it("во всех готовых режимах — и комната этот ход принимает", () => {
    const ready = MODES.filter((info) => isReady(info.id));
    assert.ok(ready.length >= 16, `готовых режимов мало: ${ready.length}`);

    for (const info of ready) {
      const position = setup(info.id);
      const thought = ask(position, LEVELS.easy);
      assert.ok(thought, `${info.title}: бот не нашёл хода`);

      const game = new TurboGame(position);
      const accepted = game.move(thought.input, 0);
      assert.equal(accepted.ok, true, `${info.title}: ход не принят`);
    }
  });

  it("не его очередь — не его ход", () => {
    const position = classicPosition();
    const thought = think({
      position,
      seat: 1,
      level: LEVELS.normal,
      traits: CHARACTER_TRAITS.drunk,
      ply: 0,
      roll: roller(1),
    });

    assert.equal(thought, null);
  });

  it("партия кончилась — хода нет, и это не ошибка", () => {
    const mate = new TurboGame(classicPosition());
    // Мат в четыре хода: дальше ходить нечем.
    for (const [from, to] of [
      ["f2", "f3"],
      ["e7", "e5"],
      ["g2", "g4"],
      ["d8", "h4"],
    ] as const) {
      assert.equal(mate.move({ from, to }, mate.ply()).ok, true);
    }

    assert.equal(ask(mate.position()), null);
  });

  it("выставление из резерва приходит в форме «с полки», а не «откуда-куда»", () => {
    // Подкрепление: ходов фигурами много, поэтому заставим бота выставлять —
    // оставим на доске только короля и полку.
    const start = reinforcementsPosition();
    const bare: Position = {
      ...start,
      board: start.board.map((cell) => (cell?.kind === "k" ? cell : null)),
    };

    const drops = new TurboGame(bare).legal().filter((move) => move.drop);
    assert.ok(drops.length > 0, "полка должна давать ходы");

    const thought = ask(bare, LEVELS.hard);
    assert.ok(thought);
    if (thought.input.drop) {
      assert.equal(thought.input.from, undefined);
      assert.ok(thought.input.to.length >= 2);
    }
    assert.equal(new TurboGame(bare).move(thought.input, 0).ok, true);
  });

  it("сильный уровень смотрит дальше слабого", () => {
    const position = classicPosition();
    const weak = ask(position, LEVELS.easy);
    const strong = ask(position, LEVELS.expert);

    assert.ok(weak && strong);
    assert.equal(weak.depth, 1);
    assert.ok(strong.depth > weak.depth);
  });

  it("выпитое укорачивает перебор", () => {
    const position = classicPosition();
    const sober = ask(position, LEVELS.expert, 0);
    const drunk = ask(position, LEVELS.expert, 9);

    assert.ok(sober && drunk);
    assert.ok(drunk.depth < sober.depth);
  });

  it("думает не мгновенно и не вечно, а в часы укладывается", () => {
    const position = classicPosition();
    const thought = ask(position);

    assert.ok(thought);
    assert.ok(thought.pauseMs >= MIN_PAUSE_MS);
    assert.ok(thought.pauseMs <= MAX_PAUSE_MS);

    const hurried = think({
      position,
      seat: 0,
      level: LEVELS.normal,
      traits: CHARACTER_TRAITS.hookah,
      ply: 0,
      roll: roller(2),
      limitMs: 2_000,
    });
    assert.ok(hurried);
    assert.ok(hurried.pauseMs <= 1_500, `пауза ${hurried.pauseMs} мс`);
  });

  it("ход воспроизводим: то же зерно — тот же ход", () => {
    const position = classicPosition();
    const once = ask(position);
    const twice = ask(position);

    assert.deepEqual(once?.input, twice?.input);
  });
});

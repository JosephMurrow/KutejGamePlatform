import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromFen } from "../engine/fen";
import { TurboGame } from "../engine/game";
import type { Position } from "../engine/position";
import {
  CHANCES,
  chanceReady,
  lastChancePosition,
  lastChanceRules,
} from "./lastChance";

/**
 * «Последний шанс»: под шахом король прыгает в случайную клетку. Проверяем и
 * саму кнопку, и то, ради чего она есть, — что мат не кончает партию, пока
 * шанс цел.
 */

const CHANCE = lastChancePosition().rules;

/** Позиция из FEN по правилам режима, с шансами у обеих сторон. */
function fen(text: string): Position {
  return { ...fromFen(text, CHANCE), chances: [CHANCES, CHANCES] };
}

/** Детский мат: после него у белых мат, но шанс ещё цел. */
function mated(): TurboGame {
  const game = new TurboGame(lastChancePosition());
  for (const [from, to] of [
    ["f2", "f3"],
    ["e7", "e5"],
    ["g2", "g4"],
    ["d8", "h4"],
  ] as const) {
    assert.equal(game.move({ from, to }, game.ply()).ok, true, `${from}${to}`);
  }
  return game;
}

describe("последний шанс: кнопка", () => {
  it("шанс один на сторону, и кнопка спит без шаха", () => {
    const position = lastChancePosition();

    assert.deepEqual(position.chances, [CHANCES, CHANCES]);
    assert.equal(position.rules.lastChance, true);
    assert.equal(chanceReady(position, 0), false, "шаха нет — и кнопки нет");
  });

  it("под шахом кнопка есть, и только у того, кому шах", () => {
    const position = fen("4k3/8/8/8/8/8/8/r3K3 w - - 0 1");

    assert.equal(chanceReady(position, 0), true);
    assert.equal(
      chanceReady(position, 1),
      false,
      "не его очередь и не ему шах",
    );
  });

  it("король прыгает, шанс тратится, ход уходит сопернику", () => {
    const game = new TurboGame(fen("4k3/8/8/8/8/8/8/r3K3 w - - 0 1"));

    const result = game.useChance(0, 0.5);
    assert.equal(result.ok, true);
    assert.equal(game.turn(), 1, "ход перешёл");
    assert.equal(game.position().chances[0], 0, "шанс истрачен");
    assert.match(game.history().at(-1) ?? "", /^K\*/, "в записи — прыжок");
    assert.equal(game.pieceAt("e1"), null, "король улетел с места");

    assert.equal(
      game.useChance(1, 0.5).ok,
      false,
      "у соперника шаха нет — кнопки тоже",
    );
  });

  it("шанс один: второй раз кнопка не работает", () => {
    const game = new TurboGame({
      ...fen("4k3/8/8/8/8/8/8/r3K3 w - - 0 1"),
      chances: [0, 0],
    });

    assert.equal(game.useChance(0, 0.5).ok, false);
  });
});

describe("последний шанс: чем кончается", () => {
  it("мат не кончает партию, пока шанс цел", () => {
    const game = mated();

    assert.equal(game.isOver(), false, "мат подождёт");
    assert.equal(chanceReady(game.position(), 0), true, "кнопка горит");
    assert.equal(game.legal().length, 0, "ходов при этом нет");
  });

  it("шанс истрачен — мат снова мат", () => {
    const game = new TurboGame({
      ...lastChancePosition(),
      chances: [0, 0],
    });
    for (const [from, to] of [
      ["f2", "f3"],
      ["e7", "e5"],
      ["g2", "g4"],
      ["d8", "h4"],
    ] as const) {
      game.move({ from, to }, game.ply());
    }

    assert.equal(game.outcome()?.reason, "checkmate");
  });

  it("приземлился под бой — короля просто съедят", () => {
    const game = new TurboGame(fen("4k3/8/8/3K4/8/8/8/3q4 b - - 0 1"));

    assert.equal(game.move({ from: "d1", to: "d5" }, 0).ok, true);
    assert.deepEqual(game.outcome(), { result: 1, reason: "kingTaken" });
  });

  it("правила игроку объясняют кнопку и мат", () => {
    const lines = lastChanceRules().join(" ");

    assert.match(lines, /ПОПРОБЫВАТЬ НЕ УМЕРЕТЬ/);
    assert.match(lines, /Шанс один/);
    assert.match(lines, /битые/);
  });
});

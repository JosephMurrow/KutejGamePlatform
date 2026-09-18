import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TurboGame } from "../engine/game";
import { squareName } from "../engine/geometry";
import type { Piece } from "../engine/pieces";
import type { Position } from "../engine/position";
import { agentPosition, agentRules, hideAgents } from "./agents";

/**
 * «Двойной агент»: у каждого одна фигура тайно работает на соперника. Агентов
 * выбирает зерно партии, метка едет вместе с фигурой, а секрет держит снимок:
 * свой агент хозяину не виден.
 */

const SEED = 20260912;

/** Клетки агентов на доске: чьи и где. */
function agents(position: Position): { side: number; square: string }[] {
  const found: { side: number; square: string }[] = [];

  position.board.forEach((cell, square) => {
    if (cell?.agent) {
      found.push({
        side: cell.side,
        square: squareName(position.geometry, square),
      });
    }
  });

  return found;
}

describe("двойной агент: кого выбрали", () => {
  it("по одной фигуре у каждой стороны, и не короля", () => {
    const position = agentPosition(SEED);
    const chosen = agents(position);

    assert.equal(chosen.length, 2);
    assert.deepEqual(
      chosen.map((one) => one.side).sort(),
      [0, 1],
      "по одному на сторону",
    );
    assert.ok(
      position.board.every((cell) => !(cell?.kind === "k" && cell.agent)),
      "король агентом не бывает",
    );
  });

  it("одно зерно — одна и та же пара, другое — другая", () => {
    assert.deepEqual(agents(agentPosition(SEED)), agents(agentPosition(SEED)));
    assert.notDeepEqual(agents(agentPosition(SEED)), agents(agentPosition(7)));
  });
});

describe("двойной агент: как им ходят", () => {
  /** Позиция, где чужой агент стоит там, где нужно тесту. */
  function planted(): Position {
    const start = agentPosition(SEED);
    const board = start.board.map((cell, square) => {
      if (cell?.agent) return { kind: cell.kind, side: cell.side } as Piece;
      // Чёрный конь b8 — агент белых: им ходит соперник чёрных.
      if (square === 57 && cell) return { ...cell, agent: true } as Piece;
      return cell;
    });

    return { ...start, board };
  }

  it("чужим агентом ходят вместо своего хода, и очередь идёт дальше", () => {
    const game = new TurboGame(planted());

    assert.equal(game.turn(), 0, "ходят белые");
    assert.equal(game.move({ from: "b8", to: "c6" }, 0).ok, true);
    assert.equal(game.turn(), 1, "очередь ушла к чёрным");
    assert.equal(game.pieceAt("c6")?.side, 1, "фигура осталась чужого цвета");
  });

  it("первый чужой ход будит агента — дальше его видят все", () => {
    const game = new TurboGame(planted());
    assert.equal(game.pieceAt("b8")?.awake, undefined);

    game.move({ from: "b8", to: "c6" }, 0);
    assert.equal(game.pieceAt("c6")?.awake, true);
  });

  it("агент бьёт врагов своего цвета, а своих не трогает", () => {
    const game = new TurboGame(planted());
    const mine = game
      .legal()
      .filter((move) => move.from === "b8")
      .map((move) => move.to);

    assert.ok(mine.includes("c6"), "ходить может");
    assert.ok(!mine.includes("d7"), "своих не бьёт: там чёрная пешка");
  });
});

describe("двойной агент: кто что видит", () => {
  it("свой агент — секрет от хозяина, чужой виден, зрителю — ни одного", () => {
    const position = agentPosition(SEED);
    const mine = agents(position).find((one) => one.side === 0);
    assert.ok(mine, "у белых агент есть");

    const forWhite = agents(hideAgents(position, 0)).map((one) => one.side);
    assert.deepEqual(forWhite, [1], "белым виден только чёрный агент");

    const forBlack = agents(hideAgents(position, 1)).map((one) => one.side);
    assert.deepEqual(forBlack, [0], "чёрным — только белый");

    assert.deepEqual(
      agents(hideAgents(position, null)),
      [],
      "зрителю — никого",
    );
  });

  it("пробуждённого видят все", () => {
    const position = agentPosition(SEED);
    const board = position.board.map((cell) =>
      cell?.agent ? ({ ...cell, awake: true } as Piece) : cell,
    );
    const awake = { ...position, board };

    assert.equal(agents(hideAgents(awake, null)).length, 2);
    assert.equal(agents(hideAgents(awake, 0)).length, 2);
  });

  it("правила игроку объясняют секрет и пробуждение", () => {
    const lines = agentRules().join(" ");

    assert.match(lines, /вы не знаете/);
    assert.match(lines, /вместо своего хода/);
    assert.match(lines, /пробуждает/);
  });
});

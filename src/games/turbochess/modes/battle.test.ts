import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TurboGame } from "../engine/game";
import { parseSquare, squareName } from "../engine/geometry";
import { piece, type PieceKind, type Side } from "../engine/pieces";
import type { Position } from "../engine/position";
import {
  BATTLE_BOARD,
  BATTLE_SIDE_NAME,
  battlePosition,
  battleRules,
} from "./battle";

/**
 * «Королевская битва»: доска 16×16, четверо по краям, все против всех.
 * Проверяем расстановку, порядок хода по часовой и то, чем партия кончается:
 * заматованный выбывает, запертый пропускает ход, побеждает последний.
 */

/** Пустая доска битвы с расставленными по именам клеток фигурами. */
function board(
  pieces: Record<string, [PieceKind, Side]>,
  turn: Side,
): Position {
  const base = battlePosition();
  const empty: (ReturnType<typeof piece> | null)[] = base.board.map(() => null);

  for (const [square, [kind, side]] of Object.entries(pieces)) {
    const at = parseSquare(base.geometry, square);
    if (at !== null) empty[at] = piece(kind, side);
  }

  return { ...base, board: empty, castling: [], turn };
}

/** Что стоит на клетке — «rN» значит ладья стороны N. */
function at(game: TurboGame, square: string): string | null {
  const cell = game.pieceAt(square);
  return cell ? `${cell.kind}${cell.side}` : null;
}

describe("битва: доска и расстановка", () => {
  it("шестнадцать на шестнадцать и четыре стороны по часовой", () => {
    const position = battlePosition();

    assert.deepEqual(position.geometry, BATTLE_BOARD);
    assert.equal(position.sides.length, 4);
    assert.deepEqual(
      position.sides.map((side) => side.forward),
      [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ],
      "юг вверх, запад вправо, север вниз, восток влево",
    );
    assert.deepEqual(BATTLE_SIDE_NAME, ["юг", "запад", "север", "восток"]);
  });

  it("у каждого края восемь фигур и восемь пешек, углы пусты", () => {
    const game = new TurboGame(battlePosition());

    assert.equal(at(game, "i1"), "k0", "король юга посередине своего края");
    assert.equal(at(game, "e1"), "r0");
    assert.equal(at(game, "e2"), "p0");
    assert.equal(at(game, "a5"), "r1", "запад стоит вдоль вертикали");
    assert.equal(at(game, "b5"), "p1");
    assert.equal(at(game, "i16"), "k2");
    assert.equal(at(game, "p9"), "k3");

    assert.equal(at(game, "a1"), null, "угол пуст");
    assert.equal(at(game, "d4"), null, "и весь угол 4×4 тоже");
    assert.equal(at(game, "h8"), null, "между сторонами пусто");
  });

  it("ходы обычные, а «вперёд» у каждого своё", () => {
    const game = new TurboGame(battlePosition());

    assert.equal(game.move({ from: "e2", to: "e4" }, 0).ok, true, "юг вверх");
    assert.equal(game.turn(), 1, "дальше ходит запад");
    assert.equal(
      game.move({ from: "b5", to: "d5" }, 1).ok,
      true,
      "запад вправо",
    );
    assert.equal(game.turn(), 2, "потом север");
  });

  it("правила игроку объясняют круг и выбывание", () => {
    const lines = battleRules().join(" ");

    assert.match(lines, /по часовой/);
    assert.match(lines, /выбывает/);
    assert.match(lines, /дальнем краю/);
  });
});

describe("битва: кто выбывает", () => {
  it("заматованный уносит фигуры, а последний за столом побеждает", () => {
    // Юг заперт в углу двумя ладьями запада; север и восток уже выбыли.
    const game = new TurboGame(
      board(
        {
          a1: ["k", 0],
          c1: ["p", 0],
          a16: ["r", 1],
          b16: ["r", 1],
          p16: ["k", 1],
        },
        1,
      ),
    );

    assert.equal(game.move({ from: "p16", to: "p15" }, 0).ok, true);
    assert.equal(at(game, "a1"), null, "заматованный ушёл с доски");
    assert.equal(at(game, "c1"), null, "и фигуры его тоже");
    assert.deepEqual(game.outcome(), { result: 1, reason: "lastStanding" });
  });

  it("запертый без шаха пропускает ход, а не выбывает", () => {
    // Ферзь держит a2, ладья — вертикаль b; самому королю шаха нет.
    const game = new TurboGame(
      board(
        {
          a1: ["k", 0],
          c4: ["q", 1],
          b16: ["r", 1],
          p16: ["k", 1],
          i16: ["k", 2],
        },
        1,
      ),
    );

    assert.equal(game.move({ from: "p16", to: "p15" }, 0).ok, true);
    assert.equal(game.isOver(), false, "партия идёт");
    assert.equal(at(game, "a1"), "k0", "король юга на месте");
    assert.equal(game.turn(), 2, "ход перешёл через запертого");
  });

  it("сдача и уход — это выбывание, а не конец партии", () => {
    const game = new TurboGame(
      board(
        {
          a1: ["k", 0],
          p16: ["k", 1],
          i16: ["k", 2],
          p1: ["k", 3],
        },
        0,
      ),
    );

    assert.equal(game.resign(0), null, "партия не кончилась");
    assert.equal(at(game, "a1"), null, "сдавшийся ушёл с доски");
    assert.equal(game.turn(), 1);

    assert.equal(game.abandon(2), null);
    assert.deepEqual(game.flag(1), { result: 3, reason: "lastStanding" });
  });

  it("пешка превращается на дальнем краю", () => {
    const game = new TurboGame(
      board({ a15: ["p", 0], p16: ["k", 1], a1: ["k", 0] }, 0),
    );
    const steps = game
      .legal()
      .filter((move) => move.from === "a15")
      .map((move) => `${move.to}${move.promotion ?? ""}`);

    assert.ok(steps.includes("a16q"), "на шестнадцатой — превращение");
    assert.equal(
      steps.filter((step) => step.startsWith("a16")).length,
      4,
      "все четыре фигуры на выбор",
    );
  });

  it("клетки читаются буквами до p", () => {
    const position = battlePosition();

    assert.equal(squareName(position.geometry, 0), "a1");
    assert.equal(squareName(position.geometry, 255), "p16");
  });
});

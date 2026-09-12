import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromFen } from "../engine/fen";
import { legalMoves } from "../engine/moves";
import { classicPosition, type Position } from "../engine/position";
import { annihilationPosition } from "../modes/annihilation";
import { battlePosition } from "../modes/battle";
import { giveawayPosition } from "../modes/giveaway";
import { megaPosition } from "../modes/mega";
import { evaluate, terminal, WIN_SCORE } from "./evaluate";

/**
 * Оценка и конец партии. Главное, за чем следит этот тест: арифметика меняется
 * вместе с целью партии, и «хорошо» в поддавках — не то же, что «хорошо» в
 * обычных шахматах.
 */

function fen(text: string, like: Position): Position {
  return fromFen(text, like.rules);
}

function resolve(position: Position) {
  return terminal(position, legalMoves(position).length);
}

describe("конец партии глазами бота", () => {
  it("мат — победа матующего, пат — ничья", () => {
    const mate = fen("7k/5QK1/8/8/8/8/8/8 b - - 0 1", classicPosition());
    assert.deepEqual(resolve(mate), { winner: 0 });

    const draw = fen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", classicPosition());
    assert.deepEqual(resolve(draw), { winner: "draw" });
  });

  it("живая позиция концом партии не считается", () => {
    assert.equal(resolve(classicPosition()), null);
  });

  it("на уничтожение: подчистую — поражение, остановка — счёт по головам", () => {
    const wipe = annihilationPosition();
    // У светлых на доске не осталось ничего: победа тёмным, и мата для этого
    // не требуется — в этом режиме его нет вовсе.
    const empty = fen("4k3/8/8/8/8/8/8/8 w - - 0 1", wipe);
    assert.deepEqual(resolve(empty), { winner: 1 });

    // Пятьдесят полуходов без взятия: считают, кто больше съел.
    const stalled: Position = {
      ...wipe,
      sinceCapture: 50,
      taken: [[...wipe.board.slice(0, 3).filter((cell) => cell !== null)], []],
    } as Position;
    assert.deepEqual(resolve(stalled), { winner: 0 });
  });

  it("поддавки: у кого съели короля, тот и выиграл", () => {
    const feed = giveawayPosition();
    const kingless = fen("8/8/8/8/8/8/4P3/4K3 b - - 0 1", feed);
    assert.deepEqual(resolve(kingless), { winner: 1 });
  });

  it("мега-шахматы: король на чужом троне кончает партию сразу", () => {
    const throne = fen("8/8/8/8/8/8/4p3/4K3 b - - 0 1", megaPosition());
    assert.deepEqual(resolve(throne), { winner: 0 });
  });

  it("битва: один выживший — победитель", () => {
    const battle = battlePosition();
    const alone: Position = {
      ...battle,
      board: battle.board.map((cell) =>
        cell?.kind === "k" && cell.side !== 2 ? null : cell,
      ),
    };
    assert.deepEqual(resolve(alone), { winner: 2 });
  });
});

describe("оценка позиции", () => {
  it("лишний ферзь — это плюс, и он же минус для соперника", () => {
    const up = fen("4k3/8/8/8/8/8/8/3QK3 w - - 0 1", classicPosition());
    assert.ok(evaluate(up, 0) > 800);
    assert.ok(evaluate(up, 1) < -800);
  });

  it("в поддавках лишний материал — беда, а не удача", () => {
    const up = fen("4k3/8/8/8/8/8/8/3QK3 w - - 0 1", giveawayPosition());
    assert.ok(evaluate(up, 0) < 0, "лишний ферзь в поддавках должен мешать");
    assert.ok(evaluate(up, 1) > 0);
  });

  it("на уничтожение считаются головы, а не номиналы", () => {
    const wipe = annihilationPosition();
    const pawns: Position = {
      ...wipe,
      taken: [
        [
          { kind: "p", side: 1 },
          { kind: "p", side: 1 },
        ],
        [{ kind: "q", side: 0 }],
      ],
    } as Position;

    // Две пешки против ферзя: по номиналам это минус, по головам плюс.
    assert.ok(evaluate(pawns, 0) > evaluate(pawns, 1));
  });

  it("съеденный король в обычной партии — это проигрыш, а не «минус девять»", () => {
    const gone = fen("8/8/8/8/8/8/8/4K3 b - - 0 1", classicPosition());
    assert.ok(evaluate(gone, 1) <= -WIN_SCORE / 2);
  });

  it("резерв — тоже материал, просто ещё не на доске", () => {
    const bare = fen("4k3/8/8/8/8/8/8/4K3 w - - 0 1", classicPosition());
    const withReserve: Position = { ...bare, reserve: [["q"], []] };

    assert.ok(evaluate(withReserve, 0) > evaluate(bare, 0) + 500);
  });
});

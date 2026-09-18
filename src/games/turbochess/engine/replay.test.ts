import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hideAgents } from "../modes/agents";
import { fromFen } from "./fen";
import { TurboGame } from "./game";
import { parseSquare } from "./geometry";
import { piece } from "./pieces";
import { decodeReplay, encodeReplay } from "./replay";

/**
 * Кадры перемотки: сжали — развернули — получили те же доски, что были в
 * партии, и ни клеткой больше того, что видит зритель.
 */

/** Доска строкой, чтобы сравнивать доски целиком. */
function picture(board: readonly (ReturnType<typeof piece> | null)[]): string {
  return board
    .map((cell) =>
      cell
        ? `${cell.kind}${cell.side}${cell.agent ? "a" : ""}${cell.mega ? "m" : ""}`
        : ".",
    )
    .join("");
}

/** Сыграть ходы подряд, проверяя, что каждый принят. */
function played(game: TurboGame, line: readonly string[]) {
  for (const move of line) {
    const [from, to, promotion] = [
      move.slice(0, 2),
      move.slice(2, 4),
      move.slice(4) || undefined,
    ];
    const input = promotion
      ? { from, to, promotion: promotion as "q" }
      : { from, to };
    assert.equal(game.move(input, game.ply()).ok, true, move);
  }
  return game;
}

describe("перемотка: кадры", () => {
  it("сжали и развернули — доски те же, что были в партии", () => {
    // Взятие, рокировка, взятие на проходе и превращение — всё, что двигает
    // больше двух клеток или меняет фигуру.
    const game = played(new TurboGame(), [
      "e2e4",
      "d7d5",
      "e4d5",
      "a7a6",
      "g1f3",
      "e7e5",
      "d5e6",
      "a6a5",
      "f1e2",
      "a5a4",
      "e1g1",
      "b7b6",
      "e6f7",
      "e8e7",
      "f7g8q",
    ]);

    const timeline = game.timeline();
    const replay = encodeReplay(timeline);
    assert.ok(replay);
    assert.equal(replay.frames.length, game.moves().length);

    const frames = decodeReplay(replay);
    assert.equal(frames.length, timeline.length);
    frames.forEach((frame, ply) => {
      assert.equal(
        picture(frame.board),
        picture(timeline[ply]?.position.board ?? []),
        `полуход ${ply}`,
      );
      assert.equal(frame.turn, timeline[ply]?.position.turn);
    });
    assert.deepEqual(frames.at(-1)?.lastMove, { from: "f7", to: "g8" });
    assert.equal(frames[0]?.lastMove, null, "у начала хода нет");
  });

  it("обычный ход — две клетки, рокировка — четыре", () => {
    const game = played(new TurboGame(), [
      "e2e4",
      "e7e5",
      "g1f3",
      "b8c6",
      "f1c4",
      "g8f6",
      "e1g1",
    ]);
    const replay = encodeReplay(game.timeline());
    assert.ok(replay);

    const changed = (frame: string) => (frame.split("|")[2] ?? "").split(",");
    assert.equal(changed(replay.frames[0] ?? "").length, 2);
    assert.equal(changed(replay.frames.at(-1) ?? "").length, 4, "O-O");
  });

  it("кадр весит десятки байт, а не доску", () => {
    const game = played(new TurboGame(), [
      "e2e4",
      "e7e5",
      "g1f3",
      "b8c6",
      "f1c4",
      "g8f6",
      "e1g1",
      "f6e4",
    ]);
    const replay = encodeReplay(game.timeline());
    assert.ok(replay);

    // Кадры шлются с каждым снимком, поэтому считаем их вес: обычный ход —
    // около двадцати знаков, и даже шестьсот полуходов — пятнадцать килобайт.
    for (const frame of replay.frames) {
      assert.ok(frame.length <= 30, `кадр «${frame}» тяжеловат`);
    }
  });

  it("чужой двойной агент не просачивается в прошлые ходы", () => {
    // Белый конь на b1 — тайный агент чёрных: его видят только чёрные.
    const start = fromFen(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -",
    );
    const b1 = parseSquare(start.geometry, "b1") ?? 1;
    const board = start.board.slice();
    board[b1] = piece("n", 0, { agent: true });

    const game = played(new TurboGame({ ...start, board }), ["e2e4", "e7e5"]);

    // Белые своего агента не знают — в их кадрах коня-агента нет ни разу.
    const forWhite = decodeReplay(
      encodeReplay(
        game.timeline().map((step) => ({
          ...step,
          position: hideAgents(step.position, 0),
        })),
      ) ?? { start: "", turn: 0, frames: [] },
    );
    assert.ok(forWhite.every((frame) => !frame.board[b1]?.agent));

    // Чёрные своего агента видят — во всех кадрах.
    const forBlack = decodeReplay(
      encodeReplay(
        game.timeline().map((step) => ({
          ...step,
          position: hideAgents(step.position, 1),
        })),
      ) ?? { start: "", turn: 0, frames: [] },
    );
    assert.ok(forBlack.every((frame) => frame.board[b1]?.agent));
  });
});

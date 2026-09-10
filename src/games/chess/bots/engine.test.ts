import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import { EnginePool } from "./pool";
import { LEVELS } from "./levels";

/**
 * Проверка живого движка.
 *
 * Движок — внешняя программа, и в проверках он есть не всегда: без него тесты
 * пропускаются, а не падают. Путь берётся из окружения, как и на сервере
 * (src/games/chess/docs/BACKLOG.md D1).
 */

const PATH = process.env.CHESS_ENGINE_PATH ?? "";
const skip = PATH === "" ? "движок не задан в CHESS_ENGINE_PATH" : false;

describe("движок ботов", { skip }, () => {
  it("отвечает легальным ходом из начальной позиции", async () => {
    const pool = new EnginePool(PATH, 1);
    const board = new Chess();

    const move = await pool.think({
      fen: board.fen(),
      elo: LEVELS.easy.elo,
      nodes: LEVELS.easy.nodes,
    });
    pool.stop();

    assert.ok(move, "движок промолчал");
    assert.match(move ?? "", /^[a-h][1-8][a-h][1-8][qrbn]?$/, move ?? "");

    const legal = board
      .moves({ verbose: true })
      .some((option) => option.from + option.to === (move ?? "").slice(0, 4));
    assert.ok(legal, `ход ${move} нелегален`);
  });

  it("играет разными уровнями и держит очередь на одном процессе", async () => {
    // Пул из одного процесса: второй запрос обязан дождаться первого, а не
    // получить чужой ответ.
    const pool = new EnginePool(PATH, 1);
    const board = new Chess(
      "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    );

    const [weak, strong] = await Promise.all([
      pool.think({ fen: board.fen(), elo: LEVELS.easy.elo, nodes: 10_000 }),
      pool.think({ fen: board.fen(), elo: LEVELS.expert.elo, nodes: 50_000 }),
    ]);
    pool.stop();

    assert.ok(weak, "лёгкий не ответил");
    assert.ok(strong, "эксперт не ответил");

    // Мат в один тут есть: сильный уровень обязан его найти.
    assert.equal(strong, "f3f7", `эксперт не увидел мат: ${strong}`);
  });

  it("без движка честно отвечает «нечем»", async () => {
    const pool = new EnginePool("", 1);
    assert.equal(pool.available, false);
    assert.equal(await pool.think({ fen: "", elo: 1500, nodes: 1000 }), null);
  });
});

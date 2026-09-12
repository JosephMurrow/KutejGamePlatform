import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromFen } from "../engine/fen";
import { classicPosition } from "../engine/position";
import { noRetreatPosition } from "../modes/noRetreat";
import { LEVELS } from "./levels";
import { search } from "./search";
import { cornered, freedom, squeeze } from "./stuck";

/**
 * Тупик пацанских шахмат: сильные уровни его избегают, слабые — нет.
 */

describe("теснота в пацанских шахматах", () => {
  it("бояться тупика есть кому: сильным уровням и только в этом режиме", () => {
    const forward = noRetreatPosition();

    assert.equal(cornered(forward, LEVELS.expert), true);
    assert.equal(cornered(forward, LEVELS.hard), true);
    assert.equal(cornered(forward, LEVELS.easy), false);
    // В обычной партии тупика нет: там это пат, и его считает сам перебор.
    assert.equal(cornered(classicPosition(), LEVELS.expert), false);
  });

  it("свобода считается для своей стороны, а не для той, чья очередь", () => {
    const start = noRetreatPosition();

    // Очередь светлых, а спрашиваем про тёмных — и ответ не ноль.
    assert.equal(start.turn, 0);
    assert.ok(freedom(start, 1) > 0);

    // Одна и та же ладья на d4: в пацанских ей запрещено назад, и ходов меньше.
    const text = "4k3/8/8/8/3R4/8/8/4K3 w - - 0 1";
    const loose = fromFen(text, classicPosition().rules);
    const tied = fromFen(text, noRetreatPosition().rules);

    assert.ok(freedom(tied, 0) < freedom(loose, 0));
  });

  it("ход, запирающий своих, дешевеет", () => {
    // Король в углу и пешка перед ним: шагнув пешкой, сторона остаётся совсем
    // без ходов, потому что назад в этом режиме не ходят.
    const tight = fromFen(
      "7k/8/8/8/8/8/8/K6P w - - 0 1",
      noRetreatPosition().rules,
    );
    const { candidates } = search(tight, { depth: 1, nodes: 500 });
    const tested = squeeze(tight, candidates);

    assert.ok(candidates.length > 1);
    // Порядок поменялся или оценки упали — штраф сработал.
    const before = candidates.map((candidate) => candidate.score);
    const after = tested.map((candidate) => candidate.score);
    assert.notDeepEqual(after, before);
    assert.ok(Math.max(...after) <= Math.max(...before));
  });

  it("просторная позиция штрафа не получает", () => {
    const roomy = fromFen(
      "4k3/8/8/8/8/8/PPPPPPPP/4K3 w - - 0 1",
      noRetreatPosition().rules,
    );
    const { candidates } = search(roomy, { depth: 1, nodes: 2_000 });
    const tested = squeeze(roomy, candidates);

    assert.deepEqual(
      tested.map((candidate) => candidate.score),
      candidates.map((candidate) => candidate.score),
    );
  });
});

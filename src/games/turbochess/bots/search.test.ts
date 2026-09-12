import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { squareName } from "../engine/geometry";
import { fromFen } from "../engine/fen";
import { classicPosition, type Position } from "../engine/position";
import { annihilationPosition } from "../modes/annihilation";
import { battlePosition } from "../modes/battle";
import { giveawayPosition } from "../modes/giveaway";
import { LEVELS } from "./levels";
import { search } from "./search";
import { WIN_SCORE } from "./evaluate";

/**
 * Перебор. Проверяется не «сила» — её проверять нечем, — а то, что перебор
 * видит очевидное, считается по цели партии и укладывается в бюджет даже на
 * доске 16×16.
 */

function fen(text: string, like: Position = classicPosition()): Position {
  return fromFen(text, like.rules);
}

/** Лучший ход перебора в виде «e2e4». */
function best(position: Position, depth = 2, nodes = 20_000): string {
  const { candidates } = search(position, { depth, nodes });
  const top = candidates[0];
  assert.ok(top, "перебор не нашёл ни одного хода");

  const { geometry } = position;
  return `${top.move.from < 0 ? "@" : squareName(geometry, top.move.from)}${squareName(geometry, top.move.to)}`;
}

describe("перебор бота", () => {
  it("берёт висящего ферзя", () => {
    assert.equal(best(fen("4k3/8/8/3q4/8/4N3/8/4K3 w - - 0 1")), "e3d5");
  });

  it("ставит мат в один ход", () => {
    const position = fen("7k/8/6K1/8/8/8/5Q2/8 w - - 0 1");
    const { candidates } = search(position, { depth: 2, nodes: 20_000 });
    const top = candidates[0];

    assert.ok(top);
    assert.equal(top.score, WIN_SCORE);
    assert.equal(squareName(position.geometry, top.move.to), "f8");
  });

  it("не отдаёт ферзя даром: ответ соперника виден со второго полухода", () => {
    // Ферзь может встать на d5, где его съест пешка. С глубиной 1 это выглядит
    // безопасным, с глубиной 2 — нет.
    const position = fen("4k3/8/2p5/8/8/8/8/3QK3 w - - 0 1");
    const shallow = search(position, { depth: 1, nodes: 4_000 });
    const deep = search(position, { depth: 2, nodes: 20_000 });

    const loses = (moves: typeof deep.candidates) =>
      moves.findIndex(
        (candidate) =>
          squareName(position.geometry, candidate.move.to) === "d5",
      );

    assert.ok(loses(deep.candidates) > loses(shallow.candidates));
  });

  it("в поддавках отдаёт, а не берёт", () => {
    // Светлая ладья под боем пешки: в обычной партии её уводят, в поддавках
    // оставляют — и даже ставят под удар охотнее.
    const position = fen(
      "4k3/8/8/8/8/2p5/8/3RK3 w - - 0 1",
      giveawayPosition(),
    );
    const { candidates } = search(position, { depth: 2, nodes: 20_000 });
    const top = candidates[0];

    assert.ok(top);
    // Пешка c3 бьёт на d2 — туда ладья и идёт: это и есть «скормить».
    assert.equal(squareName(position.geometry, top.move.to), "d2");
  });

  it("на уничтожение мат не кончает партию, и бот идёт рубить", () => {
    // Та же позиция, что в мате в один ход, плюс пешка под боем ферзя. В
    // обычной партии бот объявит мат, здесь мата нет вовсе: он снимет голову.
    const text = "7k/8/6K1/8/8/8/p4Q2/8 w - - 0 1";
    assert.equal(best(fen(text)), "f2f8");
    assert.equal(best(fen(text, annihilationPosition())), "f2a2");
  });

  it("ходить нечем — кандидатов нет, и это не ошибка", () => {
    const mate = fen("7k/5QK1/8/8/8/8/8/8 b - - 0 1");
    assert.deepEqual(search(mate, { depth: 2, nodes: 1_000 }).candidates, []);
  });

  it("бюджет просмотра держится, и углубление останавливается по нему", () => {
    const tight = search(classicPosition(), { depth: 3, nodes: 300 });

    assert.ok(tight.candidates.length > 0, "без ходов бот не останется");
    assert.ok(tight.nodes <= 400, `посмотрено слишком много: ${tight.nodes}`);
    assert.ok(
      tight.depth < 3,
      "с таким бюджетом до третьего полухода не дойти",
    );
  });

  it("доска 16×16 на четверых считается, а не вешается", () => {
    const started = Date.now();
    const result = search(battlePosition(), {
      depth: LEVELS.expert.depth,
      nodes: LEVELS.expert.nodes,
    });
    const spent = Date.now() - started;

    assert.ok(result.candidates.length >= 30, "в битве ходов хватает");
    assert.ok(result.depth >= 2, "на четверых бот смотрит дальше одного хода");

    // Потолок просмотра пересчитан на стоимость узла: шестьдесят тысяч узлов
    // обычной доски — это пятнадцать тысяч узлов доски 16×16. Иначе эксперт в
    // битве думал бы секунды, а его ждут трое живых.
    assert.ok(result.nodes <= 16_000, `посмотрено ${result.nodes}`);
    // Время — не мера силы, а страховка от зависания: под нагрузкой от
    // остальных тестов оно скачет, поэтому порог щедрый.
    assert.ok(spent < 6_000, `перебор в битве занял ${spent} мс`);
  });
});

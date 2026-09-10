import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHEATS, MAGNUS } from "./lines/magnus";
import { MOMENTS } from "./moments";
import { cheatsOf, ODDS, perfect } from "./magnus";
import { levelsFor, LEVELS, MAGNUS_WINS } from "./levels";

/** Говорящий, который всё запоминает и ничего не глотает. */
function heard() {
  const said: { key: string; fill?: Record<string, string> }[] = [];

  return {
    said,
    say: (key: string, _ply: number, fill?: Record<string, string>) => {
      said.push({ key, fill });
      return true;
    },
  };
}

/** Случайность, которой всегда «да». */
const always = () => 0;
/** И которой всегда «нет». */
const never = () => 1;

describe("скрытый уровень", () => {
  it("не значится в списке, пока его не открыли", () => {
    assert.ok(!levelsFor(0).includes("magnus"), "новичку его видеть нельзя");
    assert.ok(
      !levelsFor(MAGNUS_WINS - 1).includes("magnus"),
      "девяти побед мало",
    );
    assert.ok(levelsFor(MAGNUS_WINS).includes("magnus"), "десяти — довольно");
  });

  it("играет чуть выше рекорда живого Магнуса", () => {
    // Рекорд Карлсена — 2882. Бот на 2900: ровно настолько выше, чтобы это
    // читалось как шутка, а не как ошибка в числе.
    assert.equal(LEVELS.magnus.elo, 2900);
    assert.equal(LEVELS.magnus.hidden, true);
  });
});

describe("приёмы Магнуса", () => {
  it("флаг у него не падает, и он об этом говорит", () => {
    const voice = heard();
    const cheats = cheatsOf(voice.say, never);

    assert.equal(cheats.keepClock(40), true, "никакой случайности тут нет");
    assert.deepEqual(voice.said.at(-1)?.key, "noFlag");
  });

  it("ничью не признаёт никогда", () => {
    const voice = heard();
    const cheats = cheatsOf(voice.say, never);

    assert.equal(cheats.refuseDraw(60), true);
    assert.equal(cheats.refuseDraw(80), true, "и во второй раз тоже");
    assert.deepEqual(voice.said.at(-1)?.key, "noDraw");
  });

  it("чужой ход откатывает ровно один раз за партию", () => {
    const voice = heard();
    const cheats = cheatsOf(voice.say, always);

    assert.equal(cheats.takeback(20), true);
    assert.equal(cheats.takeback(22), false, "второй раз — уже перебор");

    cheats.restart();
    assert.equal(cheats.takeback(20), true, "новая партия — новый приём");
  });

  it("в дебюте не жульничает: там это не смешно", () => {
    const cheats = cheatsOf(heard().say, always);

    assert.equal(cheats.takeback(2), false);
    assert.equal(cheats.redo(2), false);
  });

  it("свой ход переигрывает изредка", () => {
    const voice = heard();

    assert.equal(cheatsOf(voice.say, never).redo(30), false, "обычно — нет");
    assert.equal(cheatsOf(voice.say, always).redo(30), true);
    assert.deepEqual(voice.said.at(-1)?.key, "redo");
    assert.ok(ODDS.redo < 0.5, "приём должен быть редким, иначе он мешает");
  });

  it("про фигуру в руке говорит с её названием и не повторяется", () => {
    const voice = heard();
    const cheats = cheatsOf(voice.say, always);

    cheats.holding("n", 20);
    assert.deepEqual(voice.said.at(-1), {
      key: "holding",
      fill: { фигура: "коня" },
    });

    const before = voice.said.length;
    cheats.holding("n", 21);
    assert.equal(
      voice.said.length,
      before,
      "дважды об одной фигуре — не смешно",
    );

    cheats.holding("q", 22);
    assert.deepEqual(voice.said.at(-1)?.fill, { фигура: "ферзя" });
  });

  it("незнакомую фигуру молча пропускает", () => {
    const voice = heard();
    cheatsOf(voice.say, always).holding("x", 20);

    assert.equal(voice.said.length, 0);
  });
});

describe("таблицы окончаний", () => {
  it("в позиции с полной доской за ними не ходит", async () => {
    // Тридцать две фигуры: таблиц для такой позиции не существует, и запроса
    // быть не должно — иначе каждый ход дебюта стучится на чужой сервер.
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    assert.equal(await perfect(start), null);
  });
});

describe("реплики Магнуса", () => {
  it("есть на каждый момент и на каждый приём", () => {
    assert.deepEqual(
      Object.keys(MAGNUS).sort(),
      [...MOMENTS, ...CHEATS].sort(),
    );
  });

  it("на момент их дюжина, и они не повторяются", () => {
    for (const [key, pool] of Object.entries(MAGNUS)) {
      assert.equal(pool.length, 12, key);
      assert.equal(new Set(pool).size, pool.length, `${key}: есть дубли`);
    }
  });

  it("подстановки на месте", () => {
    assert.ok(
      MAGNUS.holding.every((line) => line.includes("{фигура}")),
      "иначе приём не читается как жульничество",
    );
    assert.ok(MAGNUS.tablebase.every((line) => line.includes("{ходов}")));
  });
});

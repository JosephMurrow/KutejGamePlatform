import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromFen } from "../engine/fen";
import { marketPosition } from "../modes/market";
import { CHARACTER_TRAITS } from "./characters";
import { LEVELS } from "./levels";
import {
  bombCall,
  chanceCall,
  marketCall,
  MARKET_COOLDOWN,
  setupCall,
  setupWait,
  toastCall,
  vetoCall,
} from "./buttons";
import { CHARACTERS } from "./characters";

/**
 * Кнопки режимов. Решения вкусовые и приняты хозяином, поэтому тест следит не
 * за «правильностью», а за тем, что записанное словами и записанное числами —
 * это одно и то же.
 */

/** Бросок с заданным значением: политики берут случайность снаружи. */
function rolls(...values: number[]): () => number {
  let at = 0;
  return () => values[Math.min(at++, values.length - 1)] ?? 0.5;
}

/** Какая доля бросков приводит к нажатию. */
function share(press: (roll: () => number) => boolean): number {
  let pressed = 0;
  const tries = 200;
  for (let at = 0; at < tries; at++) {
    if (press(rolls(at / tries))) pressed++;
  }
  return pressed / tries;
}

describe("бомба", () => {
  const traits = CHARACTER_TRAITS.physicist;

  it("проигрывающий жмёт почти сразу, выигрывающий тянет", () => {
    const losing = share((roll) =>
      bombCall({ edge: -600, since: 0, traits, roll }),
    );
    const even = share((roll) => bombCall({ edge: 0, since: 0, traits, roll }));
    const winning = share((roll) =>
      bombCall({ edge: 700, since: 0, traits, roll }),
    );

    assert.ok(losing > 0.6, `проигрывая: ${losing}`);
    assert.ok(even > 0.15 && even < 0.6, `в равной: ${even}`);
    assert.ok(winning < 0.2, `выигрывая: ${winning}`);
  });

  it("выигрывающий не тянет вечно: чем дольше заряжен, тем вероятнее", () => {
    const now = share((roll) =>
      bombCall({ edge: 700, since: 0, traits, roll }),
    );
    const later = share((roll) =>
      bombCall({ edge: 700, since: 6, traits, roll }),
    );

    assert.ok(later > now, `${later} против ${now}`);
  });

  it("характер сдвигает момент: кровожадный жмёт раньше кальянщика", () => {
    const butcher = share((roll) =>
      bombCall({
        edge: 0,
        since: 0,
        traits: CHARACTER_TRAITS.butcher,
        roll,
      }),
    );
    const hookah = share((roll) =>
      bombCall({ edge: 0, since: 0, traits: CHARACTER_TRAITS.hookah, roll }),
    );

    assert.ok(butcher > hookah, `${butcher} против ${hookah}`);
  });

  it("одно зерно — один и тот же момент: партия перематывается", () => {
    const once = bombCall({ edge: 0, since: 1, traits, roll: rolls(0.2) });
    const twice = bombCall({ edge: 0, since: 1, traits, roll: rolls(0.2) });

    assert.equal(once, twice);
  });
});

describe("«НЕТ» в анархии", () => {
  const traits = CHARACTER_TRAITS.physicist;

  it("мат отменяется всегда, пока «НЕТ» есть", () => {
    assert.equal(
      vetoCall({ loss: 0, mate: true, left: 1, traits, roll: rolls(0.99) }),
      true,
    );
    assert.equal(
      vetoCall({ loss: 900, mate: true, left: 0, traits, roll: rolls(0) }),
      false,
      "кончились — значит мат снова мат",
    );
  });

  it("чем хуже чужой ход, тем вероятнее отмена", () => {
    const small = share((roll) =>
      vetoCall({ loss: 100, mate: false, left: 4, traits, roll }),
    );
    const rook = share((roll) =>
      vetoCall({ loss: 500, mate: false, left: 4, traits, roll }),
    );
    const queen = share((roll) =>
      vetoCall({ loss: 900, mate: false, left: 4, traits, roll }),
    );

    assert.ok(small < 0.1, `потеря пешки: ${small}`);
    assert.ok(rook > small && rook < queen, `ладья: ${rook}`);
    assert.ok(queen > 0.6, `ферзь: ${queen}`);
  });

  it("последнее «НЕТ» бережётся под мат", () => {
    const many = share((roll) =>
      vetoCall({ loss: 700, mate: false, left: 3, traits, roll }),
    );
    const last = share((roll) =>
      vetoCall({ loss: 700, mate: false, left: 1, traits, roll }),
    );

    assert.ok(last < many, `${last} против ${many}`);
  });
});

describe("последний шанс", () => {
  const traits = CHARACTER_TRAITS.physicist;

  it("под матом жмут все: другого выхода нет", () => {
    for (const level of [LEVELS.easy, LEVELS.expert]) {
      assert.equal(
        chanceCall({ mate: true, check: false, cost: 0, level, traits }),
        true,
      );
    }
  });

  it("без шаха кнопку не трогают", () => {
    assert.equal(
      chanceCall({
        mate: false,
        check: false,
        cost: 900,
        level: LEVELS.expert,
        traits,
      }),
      false,
    );
  });

  it("слабый берёт до мата, сильный жмёт под безвыходным шахом", () => {
    const hopeless = { mate: false, check: true, cost: 900, traits };

    assert.equal(chanceCall({ ...hopeless, level: LEVELS.easy }), false);
    assert.equal(chanceCall({ ...hopeless, level: LEVELS.expert }), true);
    // Шах, из которого есть нормальный выход, шанса не стоит.
    assert.equal(
      chanceCall({ ...hopeless, cost: 20, level: LEVELS.expert }),
      false,
    );
  });
});

describe("чужая стопка", () => {
  it("по умолчанию подтверждают честно", () => {
    const answer = toastCall({
      traits: CHARACTER_TRAITS.strategist,
      windowMs: 30_000,
      roll: rolls(0.9, 0.9, 0.5),
    });

    assert.equal(answer.confirm, true);
  });

  it("мгновенно не отвечают и за окно не вылезают", () => {
    for (const seed of [0, 0.1, 0.5, 0.99]) {
      const answer = toastCall({
        traits: CHARACTER_TRAITS.drunk,
        windowMs: 30_000,
        roll: rolls(seed),
      });

      assert.ok(answer.waitMs >= 3_000, `быстро: ${answer.waitMs}`);
      assert.ok(answer.waitMs <= 29_500, `дольше окна: ${answer.waitMs}`);
    }
  });

  it("промолчать может только характер, которому это идёт", () => {
    const honest = toastCall({
      traits: CHARACTER_TRAITS.strategist,
      windowMs: 30_000,
      roll: rolls(0.01),
    });
    const liar = toastCall({
      traits: CHARACTER_TRAITS.butcher,
      windowMs: 30_000,
      roll: rolls(0.01),
    });

    assert.equal(honest.confirm, true);
    assert.equal(liar.confirm, false);
  });
});

describe("чёрный рынок", () => {
  const traits = CHARACTER_TRAITS.coder;

  it("к прилавку не подходят чаще раза в три хода", () => {
    const position = fromFen(
      "4k3/8/8/8/8/8/8/4K3 w - - 0 1",
      marketPosition().rules,
    );
    const order = marketCall({
      position: { ...position, taken: [[{ kind: "q", side: 1 }], []] },
      seat: 0,
      since: MARKET_COOLDOWN - 1,
      traits,
      roll: rolls(0),
    });

    assert.equal(order, null);
  });

  it("без очков не покупают", () => {
    const order = marketCall({
      position: marketPosition(),
      seat: 0,
      since: 9,
      traits,
      roll: rolls(0),
    });

    assert.equal(order, null);
  });

  it("дополнительный ход берут, когда им есть что забрать", () => {
    // Ферзь под боем ладьи: взятие есть, очков хватает.
    const position = fromFen(
      "4k3/8/8/8/8/8/3q4/3RK3 w - - 0 1",
      marketPosition().rules,
    );
    const order = marketCall({
      position: {
        ...position,
        taken: [[{ kind: "r", side: 1 }], []],
      },
      seat: 0,
      since: 9,
      traits,
      roll: rolls(0),
    });

    assert.deepEqual(order, { item: "extra" });
  });

  it("воскрешают самое дорогое и ставят на свободную клетку дома", () => {
    const position = fromFen(
      "4k3/8/8/8/8/8/8/4K3 w - - 0 1",
      marketPosition().rules,
    );
    const order = marketCall({
      position: {
        ...position,
        // Слева — что забрали у нас (ферзя и пешку), справа — что забрали мы:
        // на воскрешение ферзя нужно двенадцать очков, они есть.
        taken: [
          [
            { kind: "q", side: 1 },
            { kind: "p", side: 1 },
          ],
          [
            { kind: "q", side: 0 },
            { kind: "q", side: 0 },
          ],
        ],
        spent: [0, 0],
      },
      seat: 1,
      since: 9,
      traits,
      roll: rolls(0),
    });

    assert.equal(order?.item, "revive");
    assert.equal(order?.kind, "q");
    assert.ok(order?.to, "клетка выбрана");
  });

  it("терпеливый характер проходит мимо прилавка чаще", () => {
    const position = {
      ...fromFen("4k3/8/8/8/8/8/3q4/3RK3 w - - 0 1", marketPosition().rules),
      taken: [[{ kind: "q", side: 1 }], []],
    };
    const ask = (who: keyof typeof CHARACTER_TRAITS, roll: number) =>
      marketCall({
        position,
        seat: 0,
        since: 9,
        traits: CHARACTER_TRAITS[who],
        roll: rolls(roll),
      });

    // Один и тот же бросок: вайбкодер покупает, стратег ждёт.
    assert.notEqual(ask("coder", 0.5), null);
    assert.equal(ask("strategist", 0.5), null);
  });
});

describe("расстановка вслепую", () => {
  it("у каждого характера своя заготовка, и они не все одинаковые", () => {
    const setups = CHARACTERS.map((character) =>
      JSON.stringify(setupCall(character)),
    );

    assert.equal(setups.length, 11);
    assert.ok(new Set(setups).size >= 8, "заготовки должны различаться");
  });

  it("заготовка ходит только по своей зоне", () => {
    for (const character of CHARACTERS) {
      for (const [from, to] of setupCall(character)) {
        assert.ok(from >= 0 && from < 16, `${character}: ${from}`);
        assert.ok(to >= 0 && to < 16, `${character}: ${to}`);
        assert.notEqual(from, to);
      }
    }
  });

  it("над расстановкой думают от десяти до тридцати секунд", () => {
    for (const seed of [0, 0.3, 0.99]) {
      const wait = setupWait(rolls(seed));
      assert.ok(wait >= 10_000 && wait <= 30_000, String(wait));
    }
  });
});

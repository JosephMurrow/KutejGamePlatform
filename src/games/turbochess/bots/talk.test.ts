import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { roller } from "../modes/random";
import { CHARACTERS } from "./characters";
import { linesOf, LINES } from "./lines";
import { BASE_MOMENTS, deckSize, momentsOf, MODE_MOMENTS } from "./moments";
import { moodOf } from "./mood";
import { QUIET_PLIES, Talker, typingMs } from "./talk";

/**
 * Голос бота: колода без возврата, пауза между репликами и настроение.
 */

describe("колода без возврата", () => {
  const deck = { botCapture: ["раз", "два", "три"], greeting: ["привет"] };

  it("сыгравшая реплика до конца партии не повторится", () => {
    const talker = new Talker(deck, roller(1));
    const said = new Set<string>();

    for (let at = 0; at < 3; at++) {
      const line = talker.say("botCapture", at * QUIET_PLIES);
      assert.ok(line, `реплика ${at}`);
      assert.equal(said.has(line), false, `повтор: ${line}`);
      said.add(line);
    }

    // Колода кончилась — бот молчит, а не идёт по второму кругу.
    assert.equal(talker.say("botCapture", 99), null);
  });

  it("сказав, бот молчит ближайшие полуходы", () => {
    const talker = new Talker(deck, roller(2));

    assert.ok(talker.say("botCapture", 10));
    assert.equal(talker.say("botCapture", 11), null, "рано");
    assert.ok(talker.say("botCapture", 10 + QUIET_PLIES), "пауза кончилась");
  });

  it("на приветствии и конце партии пауза не действует", () => {
    const talker = new Talker(
      { botCapture: ["раз"], greeting: ["привет"] },
      roller(3),
    );

    assert.ok(talker.say("botCapture", 10));
    assert.ok(talker.say("greeting", 10), "поздороваться можно всегда");
  });

  it("нет реплик на момент — бот молчит и не падает", () => {
    const talker = new Talker({}, roller(4));

    assert.equal(talker.say("bomb", 0), null);
    assert.equal(talker.say("greeting", 0), null);
  });

  it("новая партия — колода снова полная", () => {
    const talker = new Talker(deck, roller(5));

    assert.ok(talker.say("greeting", 0));
    assert.equal(talker.say("greeting", 1), null);

    talker.restart();
    assert.ok(talker.say("greeting", 0), "после реванша снова здоровается");
  });

  it("реплика не появляется мгновенно: её «печатают»", () => {
    for (const line of ["Ага.", "Ну ты и жук, конечно, я так не играю."]) {
      const ms = typingMs(line, roller(6));
      assert.ok(ms >= 700 && ms <= 5_000, `${line}: ${ms}`);
    }

    assert.ok(
      typingMs("Очень длинная реплика про всё на свете", () => 0.5) >
        typingMs("Ок", () => 0.5),
      "длинную печатают дольше",
    );
  });
});

describe("настроение", () => {
  it("ведёшь — злорадствуешь, отстаёшь — ноешь, потерял ферзя — паникуешь", () => {
    assert.equal(moodOf(400, 0), "gloat");
    assert.equal(moodOf(-400, 0), "whine");
    assert.equal(moodOf(-900, -900), "panic");
  });

  it("перемена важнее позиции: отыгранная фигура бодрит", () => {
    assert.equal(moodOf(-100, 300), "gloat");
    // А зевок в выигранной позиции — не повод хвастаться.
    assert.equal(moodOf(300, -300), "swagger");
  });

  it("ровная позиция — боевое настроение", () => {
    assert.equal(moodOf(0, 0), "swagger");
  });
});

describe("написанные колоды", () => {
  /** Кто уже заговорил: проверяем каждого, кого написали. */
  const written = Object.entries(LINES).flatMap(([character, deck]) =>
    deck && Object.keys(deck).length > 0 ? [[character, deck] as const] : [],
  );

  it("написан хотя бы один характер, и все они из общего списка", () => {
    assert.ok(written.length >= 2, `написано колод: ${written.length}`);
    for (const [character] of written) {
      assert.ok(
        (CHARACTERS as readonly string[]).includes(character),
        `лишний характер: ${character}`,
      );
    }
  });

  it("на каждый базовый момент полсотни реплик", () => {
    for (const [character, deck] of written) {
      for (const moment of BASE_MOMENTS) {
        const lines = deck[moment] ?? [];
        assert.ok(
          lines.length >= deckSize(moment),
          `${character}/${moment}: ${lines.length} вместо ${deckSize(moment)}`,
        );
      }
    }
  });

  it("на режимные моменты — по дюжине", () => {
    for (const [character, deck] of written) {
      for (const moments of Object.values(MODE_MOMENTS)) {
        for (const moment of moments ?? []) {
          const lines = deck[moment] ?? [];
          assert.ok(
            lines.length >= deckSize(moment),
            `${character}/${moment}: ${lines.length} вместо ${deckSize(moment)}`,
          );
        }
      }
    }
  });

  it("внутри характера реплики не повторяются", () => {
    for (const [character, deck] of written) {
      const all: string[] = [];
      for (const lines of Object.values(deck)) all.push(...(lines ?? []));

      assert.equal(
        new Set(all).size,
        all.length,
        `${character}: нашлись одинаковые реплики`,
      );
      assert.ok(all.length > 1_300, `${character}: реплик всего ${all.length}`);
    }
  });

  it("характеры говорят по-разному: чужих реплик друг у друга нет", () => {
    const seen = new Map<string, string>();

    for (const [character, deck] of written) {
      for (const lines of Object.values(deck)) {
        for (const line of lines ?? []) {
          const owner = seen.get(line);
          assert.equal(
            owner,
            undefined,
            `«${line}» есть и у ${owner}, и у ${character}`,
          );
          seen.set(line, character);
        }
      }
    }
  });

  it("реплики короткие: чат — это чат, а не письмо", () => {
    for (const [character, deck] of written) {
      for (const [moment, lines] of Object.entries(deck)) {
        for (const line of lines ?? []) {
          assert.ok(
            line.length <= 70,
            `${character}/${moment}: длинная реплика «${line}»`,
          );
          assert.ok(line.trim().length > 0, `${character}/${moment}: пустая`);
        }
      }
    }
  });

  it("в любом режиме написанному характеру есть что сказать", () => {
    for (const [character, deck] of written) {
      for (const moment of momentsOf("BOOZE")) {
        assert.ok(
          (deck[moment] ?? []).length > 0,
          `${character} молчит на ${moment}`,
        );
      }
    }
  });

  it("ненаписанные характеры молчат — и это не поломка", () => {
    const quiet = CHARACTERS.filter((one) => !(one in LINES));

    assert.equal(quiet.length, CHARACTERS.length - written.length);
    for (const character of quiet) {
      assert.deepEqual(linesOf(character), {});
    }
  });
});

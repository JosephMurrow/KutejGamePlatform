import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LINES } from "./lines";
import { QUIET_PLIES, Talker } from "./talk";

/** Предсказуемый выбор: всегда первая свежая реплика из набора. */
const first = () => 0;

describe("голос бота", () => {
  it("молчит три полухода после реплики", () => {
    const talker = new Talker(LINES.pedant, first);

    assert.ok(talker.say("botCapture", 10), "первая реплика проходит");
    assert.equal(talker.say("botChecks", 11), null, "следом — молчание");
    assert.equal(talker.say("botChecks", 12), null);
    assert.ok(
      talker.say("botChecks", 10 + QUIET_PLIES),
      "через три полухода снова можно",
    );
  });

  it("на мате говорит в обход паузы", () => {
    const talker = new Talker(LINES.brute, first);

    assert.ok(talker.say("botCapture", 10));
    assert.ok(
      talker.say("botWins", 11),
      "молчать на мате нельзя ни при какой паузе",
    );
    assert.ok(new Talker(LINES.brute, first).say("botLoses", 0));
  });

  it("не повторяет реплику дважды за партию", () => {
    const talker = new Talker(LINES.granddad, first);
    const said = new Set<string>();

    // Столько раз, сколько реплик в наборе: на каждый раз должна найтись своя.
    for (let ply = 0; ply < LINES.granddad.botCapture.length; ply += 1) {
      const line = talker.say("botCapture", ply * QUIET_PLIES);
      assert.ok(line, "реплика должна найтись");
      assert.ok(!said.has(line), `повтор: ${line}`);
      said.add(line);
    }
  });

  it("когда набор кончился, повторяется, а не немеет", () => {
    const talker = new Talker(LINES.champion, first);
    const pool = LINES.champion.stalemate.length;

    for (let at = 0; at <= pool; at += 1) {
      assert.ok(
        talker.say("stalemate", at * QUIET_PLIES),
        "промолчать хуже, чем повториться",
      );
    }
  });

  it("реванш стирает память и снимает паузу", () => {
    const talker = new Talker(LINES.pedant, first);
    const before = talker.say("greeting", 0);

    talker.reset();

    assert.equal(talker.say("greeting", 0), before, "набор снова целый");
  });

  it("говорит голосом своего характера", () => {
    for (const character of [
      "pedant",
      "brute",
      "granddad",
      "champion",
    ] as const) {
      const line = new Talker(LINES[character], first).say("greeting", 0);
      assert.ok(
        line && LINES[character].greeting.includes(line),
        `${character}: реплика не из своего набора`,
      );
    }
  });
});

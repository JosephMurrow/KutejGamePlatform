import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NEVER } from "@/games/pricetitute/engine/bet";
import { BOT_SPREAD, informedBet } from "./director";

/** Много бросков: проверяем не отдельную ставку, а поведение в целом. */
const DRAWS = 20_000;

function draws(answer: Parameters<typeof informedBet>[0]) {
  return Array.from({ length: DRAWS }, () => informedBet(answer));
}

describe("Ставка бота, который знает ответ", () => {
  it("держится в пределах разброса вокруг ответа", () => {
    const answer = 100_000;
    const бросок = draws(answer);

    const мимо = бросок.filter((bet) => {
      if (typeof bet !== "number" || bet <= 0) return true;
      const крат = Math.abs(Math.log10(bet) - Math.log10(answer));
      // Небольшой допуск: ставка округляется до рубля.
      return крат > Math.log10(BOT_SPREAD) + 1e-6;
    });

    assert.equal(мимо.length, 0, `вышли за разброс: ${мимо.length}`);
  });

  it("иногда попадает точно, но редко", () => {
    const answer = 100_000;
    const точных = draws(answer).filter((bet) => bet === answer).length;
    const доля = точных / DRAWS;

    assert.ok(доля > 0.015, `точных попаданий слишком мало: ${доля}`);
    assert.ok(доля < 0.05, `точных попаданий слишком много: ${доля}`);
  });

  it("ставит по обе стороны от ответа, а не только вверх", () => {
    const answer = 100_000;
    const бросок = draws(answer).filter((bet) => typeof bet === "number");

    assert.ok(
      бросок.some((bet) => bet < answer) && бросок.some((bet) => bet > answer),
      "разброс односторонний",
    );
  });

  it("на «ни за какие деньги» либо называет то же, либо мажет числом", () => {
    const бросок = draws(NEVER);

    assert.ok(
      бросок.some((bet) => bet === NEVER),
      "ни разу не назвал крайний вариант",
    );
    assert.ok(
      бросок.every(
        (bet) => bet === NEVER || (typeof bet === "number" && bet > 0),
      ),
      "промах по крайнему ответу оказался нулём или мусором",
    );
  });

  it("на «бесплатно» промахивается ненулевой суммой", () => {
    const бросок = draws(0);

    assert.ok(
      бросок.some((bet) => bet === 0),
      "ни разу не назвал «бесплатно»",
    );
    assert.ok(
      бросок.filter((bet) => bet === 0).length < DRAWS * 0.05,
      "«бесплатно» выпадает слишком часто",
    );
  });

  it("без ответа ведущего просто гадает и не падает", () => {
    for (const bet of draws(null)) {
      assert.ok(bet === NEVER || (typeof bet === "number" && bet >= 0));
    }
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fresh,
  idle,
  isProvisional,
  MAX_CHANGE,
  MAX_DEVIATION,
  MIN_DEVIATION,
  PROVISIONAL_DEVIATION,
  rate,
  START_RATING,
  type Rating,
} from "./glicko";

const NOW = new Date("2026-09-10T12:00:00Z");
const at = (rating: number, deviation: number, ratedAt = NOW): Rating => ({
  rating,
  deviation,
  volatility: 0.06,
  ratedAt,
});

describe("Glicko-2", () => {
  /**
   * Эталонный пример автора системы: рейтинг 1500 с отклонением 200 против
   * троих даёт 1464.05 и 151.52. Он ловит ошибку в итеративном шаге, где
   * ошибаются все (src/games/chess/docs/BACKLOG.md E1).
   *
   * Считается через нашу обёртку, а не мимо неё: иначе тест проверял бы чужой
   * пакет, а не то, что мы его правильно зовём.
   */
  it("эталонный пример автора системы", () => {
    const result = rate(
      at(1500, 200),
      [
        { opponent: { rating: 1400, deviation: 30 }, score: 1 },
        { opponent: { rating: 1550, deviation: 100 }, score: 0 },
        { opponent: { rating: 1700, deviation: 300 }, score: 0 },
      ],
      NOW,
    );

    assert.equal(Number(result.rating.toFixed(2)), 1464.05);
    assert.equal(Number(result.deviation.toFixed(2)), 151.52);
  });

  it("побеждённый слабее — рейтинг растёт, поражение от сильного дешевле", () => {
    const player = at(1500, 200);

    const win = rate(
      player,
      [{ opponent: { rating: 1400, deviation: 30 }, score: 1 }],
      NOW,
    );
    const loss = rate(
      player,
      [{ opponent: { rating: 1700, deviation: 300 }, score: 0 }],
      NOW,
    );

    assert.ok(win.rating > 1500, `после победы ${win.rating}`);
    assert.ok(loss.rating < 1500, `после поражения ${loss.rating}`);
    assert.ok(
      1500 - loss.rating < win.rating - 1500,
      "поражение от сильного и неизвестного дешевле победы над слабым",
    );
  });

  it("отклонение падает с каждой партией, но не ниже дна", () => {
    let player = at(1500, 350);

    for (let game = 0; game < 60; game += 1) {
      player = rate(
        player,
        [{ opponent: { rating: 1500, deviation: 60 }, score: 0.5 }],
        NOW,
      );
    }

    assert.ok(player.deviation < 100, `отклонение ${player.deviation}`);
    assert.ok(player.deviation >= MIN_DEVIATION);
  });

  it("простой возвращает неуверенность, но не мгновенно", () => {
    const settled = at(1800, 50, new Date("2025-09-10T12:00:00Z"));

    const week = idle(
      { ...settled, ratedAt: new Date("2026-09-03T12:00:00Z") },
      NOW,
    );
    const year = idle(settled, NOW);

    assert.ok(week < 100, `за неделю выросло до ${week}`);
    assert.ok(year > 300, `за год выросло только до ${year}`);
    assert.ok(year <= MAX_DEVIATION, "выше начального не растёт");
  });

  it("одна партия не двигает рейтинг дальше предела", () => {
    // Заведомо дикая пара: новичок обыгрывает гроссмейстера.
    const player = at(400, 350);
    const next = rate(
      player,
      [{ opponent: { rating: 3000, deviation: 30 }, score: 1 }],
      NOW,
    );

    assert.ok(
      next.rating - player.rating <= MAX_CHANGE,
      `изменение ${next.rating - player.rating}`,
    );
  });

  it("рейтинг не выходит за границы", () => {
    let low = at(410, 350);
    for (let game = 0; game < 40; game += 1) {
      low = rate(
        low,
        [{ opponent: { rating: 400, deviation: 30 }, score: 0 }],
        NOW,
      );
    }

    assert.ok(low.rating >= 400, `дно пробито: ${low.rating}`);
  });

  it("новичок провизорен, наигравший — нет", () => {
    assert.equal(isProvisional(fresh(NOW)), true);
    assert.equal(isProvisional({ deviation: PROVISIONAL_DEVIATION }), false);
    assert.equal(isProvisional({ deviation: MIN_DEVIATION }), false);
  });

  it("новичок начинает с полутора тысяч", () => {
    const start = fresh(NOW);

    assert.equal(start.rating, START_RATING);
    assert.equal(start.deviation, MAX_DEVIATION);
  });
});

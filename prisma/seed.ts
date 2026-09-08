/**
 * Сид платформы. Своё сеет каждая игра сама: платформа только зовёт их по
 * очереди и не знает ни одной игровой таблицы.
 *
 * Пока игра одна и зовётся напрямую. Диспетчер по реестру появится вместе с
 * разъездом схем (docs/BACKLOG.md A5, этап 2 в docs/PLAN.md) — тогда же
 * станет важен и порядок: сперва платформенный сид, потом игровые.
 */
import { seedPricetitute } from "../src/games/pricetitute/seed/run";

async function main() {
  await seedPricetitute();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

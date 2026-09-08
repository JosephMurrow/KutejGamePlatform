/**
 * Сид платформы.
 *
 * Платформа сеет своё, потом идёт по реестру игр и зовёт их сиды: каждая игра
 * сеет в свою схему и про чужие таблицы не знает (docs/BACKLOG.md A5).
 *
 * Порядок фиксированный — платформенный первым. Сейчас платформе сеять нечего:
 * аккаунты заводят люди, а не сид. Место оставлено осознанно, чтобы, когда
 * появится что сеять, оно легло сюда, а не в игру.
 */
import { GAME_SEEDS } from "../src/lib/games/seeds";

async function main() {
  for (const game of GAME_SEEDS) {
    console.log(`\n— сеем «${game.id}»`);
    await game.run();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

/**
 * Разовое обновление пула в базе после перевода вопросов в форму «съел(а)».
 *
 * Текст вопроса уникален и служит ключом при заливке, поэтому просто запустить
 * сид нельзя: старые строки остались бы на месте, а переписанные легли бы
 * сверху — пул удвоился бы. Здесь строки правятся по идентификатору, так что
 * история раундов остаётся целой: `Round` ссылается на id, а не на текст.
 *
 * Скрипт безопасно запускать повторно: уже обновлённые строки просто не
 * находятся по старому тексту.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { QUESTIONS } from "../prisma/seed/questions";
import { RENAMED } from "../prisma/seed/questions/renamed";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL не задан — нечего обновлять");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

/** Старый текст для большинства вопросов — это новый без скобок. */
function bare(text: string): string {
  return text
    .replace(/\(([А-Яа-яЁё]+)\)/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

async function rename(from: string, to: string): Promise<boolean> {
  if (from === to) return false;

  const { count } = await prisma.question.updateMany({
    where: { text: from },
    data: { text: to },
  });

  return count > 0;
}

async function main() {
  let updated = 0;
  let already = 0;

  // Сначала переписанные целиком: их старый текст скобками не восстановить.
  for (const [from, to] of RENAMED) {
    if (await rename(from, to)) updated++;
  }

  // Остальные: снимаем скобки и правим по получившемуся старому тексту.
  for (const { text } of QUESTIONS) {
    const old = bare(text);
    if (old === text) continue;

    if (await rename(old, text)) updated++;
  }

  for (const { text } of QUESTIONS) {
    const found = await prisma.question.count({ where: { text } });
    if (found > 0) already++;
  }

  const total = await prisma.question.count();

  console.log(`Строк обновлено: ${updated}`);
  console.log(
    `Вопросов из пула найдено в базе: ${already} из ${QUESTIONS.length}`,
  );
  console.log(`Всего в базе: ${total}`);

  if (total !== QUESTIONS.length) {
    console.log(
      `\nВНИМАНИЕ: в базе ${total} строк вместо ${QUESTIONS.length}. ` +
        `Проверь, не залит ли пул дважды.`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });

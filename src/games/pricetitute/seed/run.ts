import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { QUESTIONS } from "./questions";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL не задан — нечего сидировать");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

export async function seedPricetitute() {
  try {
    const duplicates = findDuplicates(
      QUESTIONS.map((question) => question.text),
    );
    if (duplicates.length > 0) {
      throw new Error(
        `В пуле есть повторы, поправь их перед заливкой:\n${duplicates.join("\n")}`,
      );
    }

    // createMany со skipDuplicates: повторный запуск не ломается и не плодит
    // копии, а новые вопросы просто добавляются.
    const { count } = await prisma.question.createMany({
      data: QUESTIONS,
      skipDuplicates: true,
    });

    const stats = await prisma.question.groupBy({
      by: ["pack", "adult"],
      _count: { _all: true },
      orderBy: [{ pack: "asc" }, { adult: "asc" }],
    });

    const total = await prisma.question.count();

    console.log(`Добавлено новых вопросов: ${count}`);
    console.log(`Всего в пуле: ${total}`);
    for (const row of stats) {
      const mark = row.adult ? " 18+" : "";
      console.log(`  ${row.pack}${mark}: ${row._count?._all ?? 0}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function findDuplicates(texts: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();

  for (const text of texts) {
    const key = text.trim().toLowerCase();
    if (seen.has(key)) repeated.add(text);
    seen.add(key);
  }

  return [...repeated];
}

// Prisma 7 больше не читает .env сам — подгружаем его здесь.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema",
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    // Схема разъехалась по файлам, и Prisma стала искать миграции рядом с
    // папкой схемы. Путь закрепляем: пятнадцать миграций лежат там, где лежали.
    path: "prisma/migrations",
    seed: "node --env-file-if-exists=.env --import tsx prisma/seed.ts",
  },
});

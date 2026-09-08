import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Гасит правила ESLint, которые спорят с Prettier за форматирование.
  prettier,
  // Override default ignores of eslint-config-next:
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Сгенерированный Prisma-клиент проверять незачем.
    "src/generated/**",
  ]),
  {
    // Граница платформы и игры. Игра импортирует платформу, платформа игру —
    // никогда (docs/BACKLOG.md A6). Без машинной проверки граница разъедется
    // на третьей неделе, и получится та же каша, только в двух папках.
    //
    // Реестр игр — единственное исключение: он по определению знает про все
    // игры, и именно поэтому это отдельный файл.
    //
    // `src/app/**` пока не под правилом: страницы игры лежат в общем дереве
    // маршрутов и переедут под свои адреса на этапе 3 (docs/PLAN.md).
    files: [
      "src/lib/**/*.{ts,tsx}",
      "src/server/**/*.{ts,tsx}",
      "src/shared/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
    ],
    ignores: [
      // Реестры игр знают про игры по определению — они и есть исключение.
      // Их два: клиентский едет в браузер, серверный тянет движок.
      "src/lib/games/registry.ts",
      "src/lib/games/servers.ts",
      "src/lib/games/seeds.ts",
      // Приватная комната пока держит игровые настройки колонками в
      // платформенной таблице. Это записанный долг: он уходит вместе с
      // переездом схем (docs/BACKLOG.md A4, этап 2 в docs/PLAN.md).
      "src/lib/rooms/private.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/games/**",
                "../games/**",
                "../../games/**",
                "../../../games/**",
              ],
              message:
                "Платформа не импортирует игру. Нужное от игры берётся через реестр или через интерфейс движка (docs/BACKLOG.md A6).",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;

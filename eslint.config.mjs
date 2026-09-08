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
    // Реестры игр — единственное исключение: они по определению знают про все
    // игры, и именно поэтому это отдельные файлы.
    //
    // Дерево маршрутов под правилом целиком, кроме папки самой игры: страницы
    // платитутки лежат в `src/app/games/pricetitute` и остаются её кодом,
    // просто прописанным по адресу платформы (docs/BACKLOG.md E1).
    files: [
      "src/app/**/*.{ts,tsx}",
      "src/lib/**/*.{ts,tsx}",
      "src/server/**/*.{ts,tsx}",
      "src/shared/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
    ],
    ignores: [
      // Реестры игр знают про игры по определению — они и есть исключение.
      // Клиентский едет в браузер, серверный тянет движок, страничный —
      // серверные компоненты, сидовый — сиды.
      "src/lib/games/registry.ts",
      "src/lib/games/servers.ts",
      "src/lib/games/seeds.ts",
      "src/lib/games/pages.ts",
      // Страницы игры под её собственным адресом — код игры, а не платформы.
      "src/app/games/*/**",
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

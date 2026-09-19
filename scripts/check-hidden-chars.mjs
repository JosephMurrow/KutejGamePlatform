#!/usr/bin/env node
/**
 * Хук Claude Code: после записи или правки файла ищет в нём сырые невидимые и
 * управляющие символы (docs/README.md, «Для агента»).
 *
 * Инструмент правки у агента молча превращает escape-последовательность
 * `\u202e` в сам символ, и код начинает читаться иначе, чем работает
 * («trojan source»). Страж `src/source-hygiene.test.ts` ловит это на тестах и
 * в CI; этот хук — сразу, в момент записи, пока агент ещё помнит, что писал.
 *
 * Получает на stdin JSON хука, находит путь файла. Нашёл символы — выходит с
 * кодом 2 и списком «файл:строка U+XXXX» в stderr: Claude Code возвращает это
 * агенту как ошибку. Не нашёл или файл не текстовый — молча выходит с 0.
 *
 * Правило то же, что у стража: управляющие (кроме \n, \r, \t), форматирующие
 * (нули ширины, смена направления), частные символы, разделители строк.
 */
import { readFileSync } from "node:fs";

const TEXT =
  /\.(ts|tsx|js|mjs|cjs|jsx|css|md|mdx|json|prisma|yml|yaml|html|txt|sql|sh|py)$/i;
const HIDDEN = /[\p{Cc}\p{Cf}\p{Co}\p{Zl}\p{Zp}]/u;
const ALLOWED = new Set(["\n", "\r", "\t"]);

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let path = "";
  try {
    const hook = JSON.parse(input);
    path = hook.tool_input?.file_path ?? hook.tool_response?.filePath ?? "";
  } catch {
    process.exit(0);
  }
  if (!path || !TEXT.test(path)) process.exit(0);

  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    process.exit(0);
  }

  const found = [];
  text.split("\n").forEach((line, index) => {
    for (const char of line) {
      if (ALLOWED.has(char) || !HIDDEN.test(char)) continue;
      const code = char
        .codePointAt(0)
        .toString(16)
        .toUpperCase()
        .padStart(4, "0");
      found.push(`${path}:${index + 1} U+${code}`);
    }
  });

  if (found.length === 0) process.exit(0);

  process.stderr.write(
    [
      `В файле сырые невидимые или управляющие символы (${found.length}):`,
      ...found.slice(0, 20),
      found.length > 20 ? `…и ещё ${found.length - 20}` : "",
      "Замени каждый на escape-последовательность (\\uXXXX) через python/sed,",
      "а не через Write/Edit: они и превратили escape в сырой символ.",
    ]
      .filter(Boolean)
      .join("\n") + "\n",
  );
  process.exit(2);
});

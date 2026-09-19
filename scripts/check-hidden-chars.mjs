#!/usr/bin/env node
/**
 * Хуки Claude Code против сырых невидимых и управляющих символов
 * (docs/README.md, «Для агента»).
 *
 * Инструменты агента молча превращают escape-последовательность вида
 * «обратный слэш, u, четыре цифры» в сам символ — и в Write/Edit, и в тексте
 * Bash-команды. Код начинает читаться иначе, чем работает («trojan source»).
 * Страж `src/source-hygiene.test.ts` ловит это на тестах и в CI; этот скрипт —
 * раньше, в двух местах:
 *
 * - после Write/Edit (PostToolUse): проверяет записанный файл;
 * - перед `git commit` от агента (PreToolUse, флаг `--staged`): проверяет всё,
 *   что лежит в индексе, — так ловится и то, что пришло через Bash.
 *
 * Нашёл — код выхода 2 и список «файл:строка U+XXXX» в stderr: Claude Code
 * возвращает это агенту как ошибку, а коммит не выполняется. Не нашёл или
 * файл не текстовый — молча выходит с 0.
 *
 * Правило то же, что у стража: управляющие (кроме перевода строки, возврата
 * каретки и таба), форматирующие (нули ширины, смена направления), частные
 * символы, разделители строк.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TEXT =
  /\.(ts|tsx|js|mjs|cjs|jsx|css|md|mdx|json|prisma|yml|yaml|html|txt|sql|sh|py)$/i;
const HIDDEN = /[\p{Cc}\p{Cf}\p{Co}\p{Zl}\p{Zp}]/u;
const ALLOWED = new Set(["\n", "\r", "\t"]);

/** Найти сырые символы в тексте: «путь:строка U+XXXX». */
function scan(path, text) {
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
  return found;
}

function report(found, fix) {
  if (found.length === 0) process.exit(0);
  const lines = [
    `Сырые невидимые или управляющие символы (${found.length}):`,
    ...found.slice(0, 20),
    found.length > 20 ? `…и ещё ${found.length - 20}` : "",
    fix,
  ];
  process.stderr.write(lines.filter(Boolean).join("\n") + "\n");
  process.exit(2);
}

const FIX =
  "Замени каждый на escape-последовательность через python (chr -> '\\\\u%04x'), " +
  "а не через Write/Edit или текст команды: они и превращают escape в символ.";

if (process.argv.includes("--staged")) {
  const staged = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter((path) => TEXT.test(path));

  const found = staged.flatMap((path) =>
    scan(path, execFileSync("git", ["show", `:${path}`], { encoding: "utf8" })),
  );
  report(found, `Коммит остановлен. ${FIX}`);
} else {
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
    report(scan(path, text), FIX);
  });
}

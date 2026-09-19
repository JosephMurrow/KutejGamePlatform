import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Невидимые символы в исходниках (docs/SECURITY.md, S-B8).
 *
 * Сырой управляющий символ, нуль ширины или смена направления текста в коде
 * делают так, что код читается иначе, чем исполняется («trojan source»):
 * регулярка выглядит пустой, строка — короче, чем есть, условие — наоборот.
 * Нужные в тестах символы пишутся escape-последовательностью (`\u202e`), а не
 * вставляются как есть. Инструменты правки файлов умеют превращать escape в
 * сырой символ молча — на этом уже спотыкались, — поэтому проверка машинная.
 */

const ROOTS = ["src", "scripts", "prisma", "docs"];
const SKIP = new Set(["node_modules", "generated", ".next"]);
const EXTENSIONS = /\.(ts|tsx|js|mjs|css|md|prisma|json)$/;

/** Управляющие (кроме перевода строки, возврата каретки и таба) и невидимые. */
const HIDDEN = /[\p{Cc}\p{Cf}\p{Co}\p{Zl}\p{Zp}]/u;
const ALLOWED = new Set(["\n", "\r", "\t"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return EXTENSIONS.test(name) ? [path] : [];
  });
}

describe("исходники без невидимых символов", () => {
  it("ни одного сырого управляющего или невидимого символа", () => {
    const found: string[] = [];

    for (const file of ROOTS.flatMap(files)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        for (const char of line) {
          if (ALLOWED.has(char) || !HIDDEN.test(char)) continue;
          const code = char.codePointAt(0)?.toString(16).padStart(4, "0");
          found.push(`${file}:${index + 1} U+${code}`);
        }
      });
    }

    assert.deepEqual(found, [], found.join("\n"));
  });
});

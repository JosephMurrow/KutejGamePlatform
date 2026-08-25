/**
 * Разовая правка пула: вопросы приводятся к виду «съел(а)», «согласился(ась)».
 *
 * Скрипт делает только безопасную часть — глаголы в главном предложении и в
 * однородных к нему. В придаточных подлежащим бывает не игрок («кто испортил
 * тебе жизнь», «наблюдал начальник»), и там правка идёт руками.
 *
 * Глаголы с чередованием основы («пошёл» → «пошла») скрипт не трогает вовсе:
 * скобку к ним не приписать, такие предложения переписаны отдельно.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "prisma/seed/questions";

/** Слова на «-л», которые глаголами не являются. */
const NOUNS = new Set([
  "пол",
  "бокал",
  "зал",
  "отдел",
  "фингал",
  "стол",
  "подвал",
  "провал",
]);

/** Глаголы, у которых подлежащее — не игрок. */
const NOT_PLAYER = new Set(["звучал", "нравился", "стоил"]);

/** Основа меняется, скобкой не обойтись. */
const IRREGULAR = new Set([
  "вёл",
  "завёл",
  "шёл",
  "пошёл",
  "прошёл",
  "пришёл",
  "ушёл",
  "зашёл",
  "нашёл",
  "прошёлся",
  "вышел",
  "произнёс",
  "принёс",
  "унёс",
  "отвёз",
  "перевёз",
  "вынес",
  "стёр",
  "отрёкся",
  "полез",
  "залез",
  "подстригся",
]);

function feminize(word: string): string {
  return word.endsWith("ся") ? `${word}(ась)` : `${word}(а)`;
}

function convertText(text: string): string {
  // Придаточные отделяются запятой. Однородное сказуемое через «и/а/но»
  // относится к тому же подлежащему, поэтому его правим тоже.
  return text
    .split(/(,\s*)/u)
    .map((part, index) => {
      if (index % 2 === 1) return part;

      const own = index === 0 || /^(и|а|но)\s/u.test(part);
      if (!own) return part;

      return part.replace(/[А-Яа-яЁё]+/gu, (word) => {
        if (!/л(ся)?$/u.test(word) || word.length <= 2) return word;
        if (NOUNS.has(word) || NOT_PLAYER.has(word) || IRREGULAR.has(word)) {
          return word;
        }
        return feminize(word);
      });
    })
    .join("");
}

let changed = 0;

for (const name of readdirSync(DIR)) {
  if (!name.endsWith(".ts") || name === "index.ts") continue;

  const path = join(DIR, name);
  const before = readFileSync(path, "utf8");
  const after = before.replace(/"([^"]*)"/gu, (_, text: string) =>
    JSON.stringify(convertText(text)),
  );

  if (before !== after) {
    writeFileSync(path, after);
    changed++;
  }
}

console.log(`Файлов изменено: ${changed}`);

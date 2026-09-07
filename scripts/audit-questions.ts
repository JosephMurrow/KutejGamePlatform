import { QUESTIONS } from "../prisma/seed/questions";

/**
 * Аудит пула вопросов.
 *
 * Правило рода из J1 держится на одном: скобка дописывается к слову, поэтому
 * годится только там, где женская форма — это мужская плюс окончание. «съел(а)»
 * работает, «пошёл(пошла)» — нет, там основа меняется и предложение надо
 * переписывать целиком.
 *
 * Проверять это глазами на тысяче с лишним строк бессмысленно, поэтому здесь
 * ровно те проверки, которые в J1 гонялись руками:
 *
 *   npm run audit:questions
 */

/** Все скобки, какие есть в пуле. Ничего сверх этого списка заводить не надо. */
const ALLOWED = new Set(["а", "ась", "ла", "ей", "ая"]);

/**
 * Основы с чередованием: к ним скобку не приклеить. «пошёл» + «а» даёт
 * «пошёла», а не «пошла».
 *
 * Ловится по «ё» в последнем слоге («нёс», «увёл», «сжёг», «прошёлся») и по
 * «-шел» отдельно: у «вышел» и «зашёл» буквы «ё» нет, а основа всё равно
 * меняется. Похожие на вид «вынес» и «вывел» под правило не попадают и
 * правильно: их женская форма — это мужская плюс окончание.
 *
 * Правило намеренно чуть жаднее нужного: редкие «утёр(ла)» оно тоже поднимет,
 * и это дешевле, чем пропустить «прошёлся(ась)».
 */
const SHIFTING = /(шёл|шел|ё[а-яё]{0,3})$/;

const START = "За какую сумму ты бы ";

/**
 * Слова, которые сами по себе мужского рода. Скобка их чинит («прав(а)»,
 * «уверен(а)», «сам(а)»), а без скобки они выдают пол — и вопрос перестаёт
 * читаться женщиной.
 *
 * Прилагательные в творительном падеже («был трезвым водителем») скобкой не
 * чинятся вовсе: такие предложения переписываются целиком, поэтому здесь их
 * нет — ловятся отдельным правилом ниже.
 */
const GENDERED = [
  "прав",
  "уверен",
  "готов",
  "должен",
  "рад",
  "виноват",
  "женат",
  "свободен",
  "пьян",
  "трезв",
  "здоров",
  "спокоен",
  "один",
  "сам",
];

/**
 * Мужской творительный падеж прилагательного: «пьяным», «первым», «голым».
 *
 * Границы слова пишутся руками, а не через `\b`: в JavaScript он определён
 * только по латинице, и на кириллице срабатывает где попало.
 */
const INSTRUMENTAL = /(?<![а-яё])[а-яё]{4,}(?:ым|им)(?![а-яё])/gi;

interface Problem {
  text: string;
  why: string;
}

function audit(): { problems: Problem[]; warnings: Problem[] } {
  const problems: Problem[] = [];
  const warnings: Problem[] = [];
  const seen = new Map<string, number>();

  for (const { text } of QUESTIONS) {
    const key = text.trim().toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);

    if (!text.startsWith(START)) {
      problems.push({ text, why: `не начинается с «${START.trim()}»` });
    }
    if (!text.endsWith("?")) {
      problems.push({ text, why: "не кончается вопросительным знаком" });
    }

    // Дальше идут подсказки, а не ошибки: «один раз» — это числительное, а
    // «полным залом» и «бывшим» говорят не про игрока. Разобрать их можно
    // только глазами, как в J1 разбирали придаточные.
    for (const word of GENDERED) {
      const bare = new RegExp(`(?<![а-яё])${word}(?![а-яё(])`, "i");
      if (bare.test(text)) {
        warnings.push({ text, why: `«${word}» без скобки` });
      }
    }

    for (const match of text.matchAll(INSTRUMENTAL)) {
      warnings.push({ text, why: `«${match[0]}» — мужской творительный` });
    }

    for (const match of text.matchAll(/([А-Яа-яё]*)\(([А-Яа-яё]+)\)/g)) {
      const [, stem = "", inside = ""] = match;

      if (!ALLOWED.has(inside)) {
        problems.push({ text, why: `скобка «(${inside})» вне списка` });
      }
      if (SHIFTING.test(stem)) {
        problems.push({
          text,
          why: `«${stem}» — основа с чередованием, скобка не годится`,
        });
      }
    }
  }

  for (const [key, count] of seen) {
    if (count > 1) problems.push({ text: key, why: `повторов: ${count}` });
  }

  return { problems, warnings };
}

/**
 * Мужские формы без скобки. Не ошибка сама по себе — «рубль» и «стол» тоже
 * кончаются на «л», — но список стоит прочитать глазами.
 */
function suspects(): string[] {
  const found = new Set<string>();

  for (const { text } of QUESTIONS) {
    for (const match of text.matchAll(
      /(?<![а-яё])([а-яё]{3,}?[аеиоуыэюяё]л)(?![а-яё(])/gi,
    )) {
      const word = match[1];
      if (word) found.add(word.toLowerCase());
    }
  }

  return [...found].sort();
}

const { problems, warnings } = audit();
const maybe = suspects();
const verbose = process.argv.includes("--all");

console.log(`Вопросов в пуле: ${QUESTIONS.length}`);

if (maybe.length > 0) {
  console.log(`\nМужские формы без скобки (${maybe.length}):`);
  console.log(`  ${maybe.join(", ")}`);
}

if (warnings.length > 0) {
  console.log(`\nПосмотреть глазами: ${warnings.length}`);
  if (verbose) {
    for (const warning of warnings) {
      console.log(`  · ${warning.why}\n    ${warning.text}`);
    }
  } else {
    console.log("  (список — `npm run audit:questions -- --all`)");
  }
}

if (problems.length === 0) {
  console.log("\nОшибок нет\n");
  process.exit(0);
}

console.log(`\nОшибок: ${problems.length}`);
for (const problem of problems) {
  console.log(`  ✗ ${problem.why}\n    ${problem.text}`);
}
process.exit(1);

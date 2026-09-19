#!/usr/bin/env node
/**
 * Проверка зависимостей для CI (docs/SECURITY.md, S-A2).
 *
 * Падает на любой высокой или критической уязвимости в боевых зависимостях —
 * кроме разобранных и принятых: они перечислены ниже, у каждой причина и
 * условие, когда исключение снимать. Голый `npm audit --audit-level=high`
 * здесь не годится: он падал бы на принятом навсегда, и красный CI перестали
 * бы замечать.
 *
 * Исключение привязано к номеру уведомления, а не к пакету: новая уязвимость
 * в том же пакете снова уронит проверку.
 *
 * Запуск: npm run audit:check
 */
import { execFileSync } from "node:child_process";

/** Принятые уведомления: номер → почему не касается нас и когда снимать. */
const ACCEPTED = {
  "GHSA-ggr8-5vv4-36mx":
    "deepmerge-ts в конфиге Prisma сливает только наш prisma.config.ts, " +
    "чужие данные туда не попадают. Лечится лишь Prisma 8 — снять вместе с " +
    "переходом на неё (SECURITY.md, S-A1).",
};

const SEVERE = new Set(["high", "critical"]);

let raw;
try {
  raw = execFileSync("npm", ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  // npm audit выходит с ненулевым кодом, когда находит уязвимости; вывод при
  // этом на месте.
  raw = error.stdout;
}

const report = JSON.parse(raw);
const problems = [];
const accepted = new Set();

for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    // Строка в via — это «уязвим через пакет такой-то»; само уведомление
    // придёт отдельной записью этого пакета.
    if (typeof via !== "object" || !SEVERE.has(via.severity)) continue;

    const id = via.url?.split("/").pop() ?? "";
    if (id in ACCEPTED) {
      accepted.add(`${id} (${name})`);
      continue;
    }
    problems.push(`${via.severity}: ${name} — ${via.title} — ${via.url}`);
  }
}

for (const item of accepted)
  console.log(`принято: ${item} — ${ACCEPTED[item.split(" ")[0]]}`);

if (problems.length > 0) {
  console.error(
    "Уязвимые зависимости:\n" + problems.map((p) => `  ${p}`).join("\n"),
  );
  console.error(
    "\nОбнови пакет или, если уязвимость нас не касается, разбери её и добавь в ACCEPTED с причиной.",
  );
  process.exit(1);
}

console.log("Высоких и критических уязвимостей, кроме принятых, нет.");

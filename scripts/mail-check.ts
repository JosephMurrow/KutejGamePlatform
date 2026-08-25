/**
 * Проверка отправки: шлёт тестовое письмо на указанный адрес.
 *
 * Этап настройки почты заканчивается не написанным кодом, а дошедшим письмом,
 * поэтому проверять надо именно так — и локально в песочнице, и на боевом
 * сервере с настоящим релеем.
 *
 * Запуск: npm run mail:check -- кому@пример.рф
 */
import { buildLetter } from "../src/lib/mail/letter";
import { appLink, isMailConfigured, sendLetter } from "../src/lib/mail/send";

const to = process.argv[2];
if (!to) {
  console.error("Кому слать? npm run mail:check -- адрес@пример.рф");
  process.exit(1);
}

if (!isMailConfigured()) {
  console.error("MAIL_HOST не задан — отправка не настроена, слать нечем.");
  process.exit(1);
}

const letter = buildLetter({
  subject: "Проверка почты — Платитутка",
  heading: "Почта работает",
  lines: [
    "Это тестовое письмо. Если оно дошло, отправка настроена правильно.",
    "Ничего делать не нужно — просто удали его.",
  ],
  action: { label: "Открыть игру", url: appLink("/") },
  footer: "Письмо отправлено вручную скриптом mail-check.",
});

sendLetter(to, letter)
  .then((ok) => {
    console.log(ok ? `Письмо ушло на ${to}` : "Релей письмо не принял");
    process.exit(ok ? 0 : 1);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });

import { buildLetter, type Letter } from "./letter";
import { appLink } from "./send";

/** Готовые письма платформы. Тексты собраны здесь, чтобы не растекались по коду. */

export function welcomeLetter(login: string, token: string): Letter {
  return buildLetter({
    subject: "Ты в игре — Кутёж",
    heading: "Регистрация прошла",
    lines: [
      `Твой логин: ${login}. Входить в игру нужно им, а не адресом почты.`,
      "Играть можно прямо сейчас — ждать ничего не надо. Но подтверди адрес: " +
        "без этого забытый пароль восстановить будет нечем.",
    ],
    action: { label: "Подтвердить адрес", url: appLink(`/confirm/${token}`) },
    footer: "Ссылка живёт час. Если она протухла, запроси новую в профиле.",
  });
}

export function confirmLetter(login: string, token: string): Letter {
  return buildLetter({
    subject: "Подтверди адрес — Кутёж",
    heading: "Подтверждение почты",
    lines: [
      `Этот адрес указан для аккаунта ${login}.`,
      "Подтверди его — тогда забытый пароль можно будет восстановить.",
    ],
    action: { label: "Подтвердить адрес", url: appLink(`/confirm/${token}`) },
    footer:
      "Если ты этого не просил, просто удали письмо: без перехода по ссылке " +
      "ничего не произойдёт.",
  });
}

export function resetLetter(login: string, token: string): Letter {
  return buildLetter({
    subject: "Восстановление пароля — Кутёж",
    heading: "Новый пароль",
    lines: [
      `Кто-то запросил восстановление пароля для аккаунта ${login}.`,
      "Перейди по ссылке и задай новый пароль. Все открытые сессии этого " +
        "аккаунта после этого закроются.",
    ],
    action: { label: "Задать новый пароль", url: appLink(`/reset/${token}`) },
    footer:
      "Ссылка живёт час и срабатывает один раз. Если это был не ты — просто " +
      "удали письмо, пароль останется прежним.",
  });
}

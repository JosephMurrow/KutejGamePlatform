/**
 * Варианты настроек приватной комнаты.
 *
 * Живут в `shared`, потому что нужны и форме создания в браузере, и разбору
 * присланного на сервере. Импорт из `lib/rooms/private.ts` утащил бы в
 * браузерный бандл Prisma.
 */

export interface Choice {
  value: number;
  label: string;
}

export const BETTING_CHOICES: readonly Choice[] = [
  { value: 60_000, label: "1 минута" },
  { value: 120_000, label: "2 минуты" },
  { value: 300_000, label: "5 минут" },
];

/**
 * Сколько показывать вскрышку. Большой компании тридцати секунд мало — список
 * ставок не успевают прочитать; вдвоём, наоборот, долго.
 */
export const REVEAL_CHOICES: readonly Choice[] = [
  { value: 5_000, label: "5 секунд" },
  { value: 10_000, label: "10 секунд" },
  { value: 30_000, label: "30 секунд" },
];

export const DEFAULT_REVEAL_MS = 30_000;
export const DEFAULT_BETTING_MS = 300_000;

/** Значение из формы. Всё, чего нет в списке, откатывается к умолчанию. */
export function parseRevealMs(value: unknown): number {
  const ms = Number(value);
  return REVEAL_CHOICES.some((choice) => choice.value === ms)
    ? ms
    : DEFAULT_REVEAL_MS;
}

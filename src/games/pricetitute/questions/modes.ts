/**
 * Режимы комнаты: хозяин выбирает не паки поштучно, а один из трёх наборов.
 *
 * Три понятных варианта вместо пяти галочек, которые ещё надо сопоставить в
 * голове. Заодно выполняется требование «чернота только вручную»: она входит
 * ровно в один режим, и выбрать его можно только осознанно.
 */

export const QUESTION_MODES = ["normal", "drunk_party", "hardcore"] as const;

export type QuestionMode = (typeof QUESTION_MODES)[number];

export type QuestionPack = "STANDARD" | "DRUNK" | "SEX" | "CRIME" | "BLACK";

/**
 * В жёстком режиме «Стандарта» нет намеренно: «за сколько ты бы неделю ходил в
 * мокрых носках» там не выпадет вовсе.
 */
export const PACKS_BY_MODE: Record<QuestionMode, readonly QuestionPack[]> = {
  normal: ["STANDARD"],
  drunk_party: ["STANDARD", "DRUNK", "SEX", "CRIME"],
  hardcore: ["DRUNK", "SEX", "CRIME", "BLACK"],
};

export interface ModeCopy {
  title: string;
  hint: string;
}

export const MODE_COPY: Record<QuestionMode, ModeCopy> = {
  normal: {
    title: "Обычный",
    hint: "Бытовое, неловкое и социально рискованное. Тем же играет общий зал.",
  },
  drunk_party: {
    title: "Пьяная компания",
    hint: "Всё из обычного плюс пьянка, секс и криминал.",
  },
  hardcore: {
    title: "Совсем жёстко",
    hint: "Пьянка, секс, криминал и чернота 21+. Бытовых вопросов тут нет вовсе.",
  },
};

/**
 * Есть ли в режиме чернота. По этому же признаку показывается предупреждение
 * на входе по ссылке и включается матерный набор реплик у ботов.
 */
export function isHardcore(mode: QuestionMode): boolean {
  return PACKS_BY_MODE[mode].includes("BLACK");
}

/**
 * Имеет ли смысл галочка «включить вопросы 18+». Только в обычном режиме: в
 * остальных всё содержимое взрослое по определению, и выключать там нечего.
 */
export function adultChoiceApplies(mode: QuestionMode): boolean {
  return mode === "normal";
}

/** Как режим называется в базе. Совпадает с enum QuestionMode в схеме. */
export type QuestionModeDb = "NORMAL" | "DRUNK_PARTY" | "HARDCORE";

const TO_DB: Record<QuestionMode, QuestionModeDb> = {
  normal: "NORMAL",
  drunk_party: "DRUNK_PARTY",
  hardcore: "HARDCORE",
};

export function dbValue(mode: QuestionMode): QuestionModeDb {
  return TO_DB[mode];
}

/** Разбор режима из строки: из формы и из базы приходит текст. */
export function parseMode(value: unknown): QuestionMode {
  const found = QUESTION_MODES.find(
    (mode) => mode === value || TO_DB[mode] === value,
  );
  return found ?? "normal";
}

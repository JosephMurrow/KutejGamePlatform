import { adult01 } from "./adult-01";
import { black01 } from "./black-01";
import { black02 } from "./black-02";
import { crime01 } from "./crime-01";
import { crime02 } from "./crime-02";
import { daily01 } from "./daily-01";
import { daily02 } from "./daily-02";
import { daily03 } from "./daily-03";
import { drunk01 } from "./drunk-01";
import { sex01 } from "./sex-01";
import { social01 } from "./social-01";
import { social02 } from "./social-02";

export type SeedPack = "STANDARD" | "DRUNK" | "SEX" | "CRIME" | "BLACK";

export interface QuestionSeed {
  text: string;
  pack: SeedPack;
  adult: boolean;
}

function batch(texts: string[], pack: SeedPack, adult: boolean) {
  return texts.map((text) => ({ text, pack, adult }));
}

/**
 * Стартовый пул.
 *
 * «Стандарт» — прежние 500 в прежней пропорции: половина бытовых, треть
 * социально рискованных, пятая часть 18+. Тематические паки взрослые целиком,
 * поэтому флаг adult у них всегда поднят: галочка «убрать 18+» работает только
 * в обычном режиме, где играет один «Стандарт».
 */
export const QUESTIONS: QuestionSeed[] = [
  ...batch(daily01, "STANDARD", false),
  ...batch(daily02, "STANDARD", false),
  ...batch(daily03, "STANDARD", false),
  ...batch(social01, "STANDARD", false),
  ...batch(social02, "STANDARD", false),
  ...batch(adult01, "STANDARD", true),
  ...batch(drunk01, "DRUNK", true),
  ...batch(sex01, "SEX", true),
  ...batch(crime01, "CRIME", true),
  ...batch(crime02, "CRIME", true),
  ...batch(black01, "BLACK", true),
  ...batch(black02, "BLACK", true),
];

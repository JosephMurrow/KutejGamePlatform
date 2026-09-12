import { classicPosition, type Position } from "../engine/position";
import type { ModeOptions } from "../rooms/settings";
import { agentPosition, agentRules } from "./agents";
import { anarchyPosition, anarchyRules } from "./anarchy";
import { annihilationPosition, annihilationRules } from "./annihilation";
import { battlePosition, battleRules } from "./battle";
import { modeInfo, type TurboMode } from "./catalog";
import { boozePosition, boozeRules } from "./booze";
import { giveawayPosition, giveawayRules } from "./giveaway";
import { lastChancePosition, lastChanceRules } from "./lastChance";
import { marketPosition, marketRules } from "./market";
import { megaPosition, megaRules } from "./mega";
import { noRetreatPosition, noRetreatRules } from "./noRetreat";
import { nuclearOptions, nuclearRules, nuclearThreshold } from "./nuclear";
import {
  ONE_KIND_LABEL,
  oneKindOf,
  oneKindOptions,
  oneKindPosition,
  oneKindRules,
} from "./oneKind";
import { reinforcementsPosition, reinforcementsRules } from "./reinforcements";
import { showdownPosition, showdownRules, showdownStart } from "./showdown";
import { zombiePosition, zombieRules } from "./zombies";

/**
 * Каркас режимов: чем режим отличается от обычных шахмат.
 *
 * Комната спрашивает здесь начальную позицию, форма — ручки, экран — правила
 * для игрока. Движок про режимы не знает ничего: режим встаёт в него через
 * позицию, а на следующих этапах — через точки расширения из docs/SPEC.md,
 * раздел 11.
 *
 * Код без серверных зависимостей: правила читает и браузер.
 */

/**
 * Режимы, у которых свои правила уже работают. Остальные пока играют
 * обычные шахматы, и экран комнаты говорит об этом прямо.
 */
const READY: ReadonlySet<TurboMode> = new Set([
  "CLASSIC",
  "ONE_KIND",
  "ANNIHILATION",
  "GIVEAWAY",
  "NUCLEAR",
  "REINFORCEMENTS",
  "ZOMBIE",
  "SHOWDOWN",
  "NO_RETREAT",
  "MEGA",
  "DOUBLE_AGENT",
  "LAST_CHANCE",
  "ANARCHY",
  "BOOZE",
  "BLACK_MARKET",
  "BATTLE_ROYALE",
]);

export function isReady(mode: TurboMode): boolean {
  return READY.has(mode);
}

/**
 * Начальная позиция партии в этом режиме.
 *
 * Позиция несёт не только расстановку, но и правила режима — чем кончается
 * партия и обязательно ли брать (engine/position.ts). Поэтому режим, который
 * меняет цель, а не доску, тоже приходит сюда: у «ядерных» расстановка
 * обычная, и они остаются с умолчанием.
 */
export function startPosition(
  mode: TurboMode,
  options: ModeOptions,
  /** Зерно случайности партии: по нему выбираются двойные агенты. */
  seed = 0,
): Position {
  switch (mode) {
    case "ONE_KIND":
      return oneKindPosition(oneKindOf(options));
    case "ANNIHILATION":
      return annihilationPosition();
    case "GIVEAWAY":
      return giveawayPosition();
    case "REINFORCEMENTS":
      return reinforcementsPosition();
    case "ZOMBIE":
      return zombiePosition();
    // До вскрытия партия стоит стандартной расстановкой: её и получит тот,
    // кто ничего не тронул. Настоящую позицию соберёт комната, когда оба
    // будут готовы.
    case "SHOWDOWN":
      return showdownPosition([showdownStart(), showdownStart()]);
    case "NO_RETREAT":
      return noRetreatPosition();
    case "MEGA":
      return megaPosition();
    case "DOUBLE_AGENT":
      return agentPosition(seed);
    case "LAST_CHANCE":
      return lastChancePosition();
    case "ANARCHY":
      return anarchyPosition();
    case "BOOZE":
      return boozePosition();
    case "BLACK_MARKET":
      return marketPosition();
    case "BATTLE_ROYALE":
      return battlePosition();
    default:
      return classicPosition();
  }
}

/**
 * Ручки режима из формы. У режимов без ручек — пусто: всё, что клиент пришлёт
 * сверх положенного, выбрасывается.
 */
export function modeOptions(
  mode: TurboMode,
  read: (name: string) => unknown,
): ModeOptions {
  switch (mode) {
    case "ONE_KIND":
      return oneKindOptions(read);
    case "NUCLEAR":
      return nuclearOptions(read);
    default:
      return {};
  }
}

export interface ModeRules {
  /** Какой вариант режима выбран — «все — ферзи»; `null` — у режима их нет. */
  variant: string | null;
  /** Правила для игрока, по абзацу. */
  lines: string[];
  /** Свои правила режима уже работают. */
  ready: boolean;
}

/** Правила для игрока — на карточке перед стартом и по кнопке у доски. */
export function rulesOf(mode: TurboMode, options: ModeOptions): ModeRules {
  switch (mode) {
    case "CLASSIC":
      return { variant: null, lines: ["Обычные шахматы."], ready: true };
    case "ONE_KIND":
      return {
        variant: `все — ${ONE_KIND_LABEL[oneKindOf(options)]}`,
        lines: oneKindRules(options),
        ready: true,
      };
    case "ANNIHILATION":
      return { variant: null, lines: annihilationRules(), ready: true };
    case "GIVEAWAY":
      return { variant: null, lines: giveawayRules(), ready: true };
    case "NUCLEAR":
      return {
        variant: `порог ${nuclearThreshold(options)} очков`,
        lines: nuclearRules(options),
        ready: true,
      };
    case "REINFORCEMENTS":
      return { variant: null, lines: reinforcementsRules(), ready: true };
    case "ZOMBIE":
      return { variant: null, lines: zombieRules(), ready: true };
    case "SHOWDOWN":
      return { variant: null, lines: showdownRules(), ready: true };
    case "NO_RETREAT":
      return { variant: null, lines: noRetreatRules(), ready: true };
    case "MEGA":
      return { variant: null, lines: megaRules(), ready: true };
    case "DOUBLE_AGENT":
      return { variant: null, lines: agentRules(), ready: true };
    case "LAST_CHANCE":
      return { variant: null, lines: lastChanceRules(), ready: true };
    case "ANARCHY":
      return { variant: null, lines: anarchyRules(), ready: true };
    case "BOOZE":
      return { variant: null, lines: boozeRules(), ready: true };
    case "BLACK_MARKET":
      return { variant: null, lines: marketRules(), ready: true };
    case "BATTLE_ROYALE":
      return { variant: null, lines: battleRules(), ready: true };
    default:
      return {
        variant: null,
        lines: [
          modeInfo(mode).short,
          "Свои правила этого режима встанут на его этапе. Пока играем обычные шахматы.",
        ],
        ready: false,
      };
  }
}

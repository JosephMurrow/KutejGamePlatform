/**
 * Установка на домашний экран: что это за телефон и пора ли предлагать
 * (docs/BACKLOG.md E1).
 *
 * Здесь только чистые функции. Всё, что смотрит в `navigator` и в
 * `localStorage`, живёт в компоненте — и только внутри эффекта: на сервере
 * этих имён нет, а решение, принятое при отрисовке, разошлось бы с серверной
 * разметкой.
 */

/**
 * Что человеку показывать. Это не «какая ОС», а «какой путь установки ему
 * доступен» — потому в списке и есть `ios-other`: на айфоне не в Safari
 * поставить приложение нельзя вовсе.
 */
export type InstallWay = "ios-safari" | "ios-other" | "android" | "desktop";

/** Признаки браузера, по которым выбирается путь. */
export interface Browser {
  userAgent: string;
  /** У iPadOS 13 и новее агент маковский — отличает только тач. */
  maxTouchPoints: number;
  platform: string;
}

/** Браузеры на айфоне, которые снаружи WebKit, а внутри не Safari. */
const НЕ_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo/;

export function isIOS({
  userAgent,
  maxTouchPoints,
  platform,
}: Browser): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;

  /*
   * Агент прямо говорит «андроид» — верим ему и до догадки ниже не доходим.
   *
   * Строчка не теоретическая: на ней и поймали. Мобильный режим в
   * инструментах разработчика подменяет агент, но `navigator.platform`
   * оставляет маковский, а число касаний ставит пять — и догадка про айпад
   * срабатывала на «телефоне» с андроидным агентом. Живой андроид сюда бы не
   * попал, но догадка обязана уступать явному признаку в любом случае.
   */
  if (/Android/.test(userAgent)) return false;

  // iPadOS 13+ представляется маком; тач — единственное отличие.
  return platform === "MacIntel" && maxTouchPoints > 1;
}

export function installWay(browser: Browser): InstallWay {
  if (/Android/.test(browser.userAgent)) return "android";

  if (isIOS(browser)) {
    return НЕ_SAFARI.test(browser.userAgent) ? "ios-other" : "ios-safari";
  }

  return "desktop";
}

/**
 * Приложение уже открыто с домашнего экрана.
 *
 * Два признака, потому что одного мало: `display-mode` — стандартный, а
 * `navigator.standalone` — нестандартный признак Safari, и на айфоне он
 * надёжнее.
 */
export function isStandalone(displayMode: boolean, safari?: boolean): boolean {
  return displayMode || safari === true;
}

/** Сколько помним отказ. Две недели — достаточно, чтобы не надоедать. */
export const SNOOZE_DAYS = 14;

/** Не в первый заход: на первом человеку ещё не за чем возвращаться. */
export const MIN_VISITS = 2;

export interface HintState {
  /** Приложение уже установлено и открыто с иконки. */
  standalone: boolean;
  /** Который это заход, считая текущий. */
  visits: number;
  /** До какого времени отказ ещё в силе. */
  dismissedUntil: number;
  now: number;
}

/**
 * Пора ли предлагать установку.
 *
 * Отдельной функцией, потому что здесь легко ошибиться в пользу навязчивости,
 * а цена ошибки — раздражение на каждом заходе.
 */
export function shouldOffer({
  standalone,
  visits,
  dismissedUntil,
  now,
}: HintState): boolean {
  // Уже поставил — предлагать нечего и незачем.
  if (standalone) return false;

  // Первый заход: человек ещё не знает, нужно ли ему это.
  if (visits < MIN_VISITS) return false;

  // Отказался — молчим до срока.
  if (now < dismissedUntil) return false;

  return true;
}

/** До какого времени молчать после отказа. */
export function snoozeUntil(now: number): number {
  return now + SNOOZE_DAYS * 24 * 60 * 60 * 1000;
}

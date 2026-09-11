"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  installWay,
  isStandalone,
  shouldOffer,
  snoozeUntil,
  type InstallWay,
} from "@/lib/install";

/**
 * Подсказка «поставь на домашний экран» (docs/BACKLOG.md E1–E3).
 *
 * Без неё вся версия 3.0 бесполезна: на айфоне «На экран „Домой“» спрятано в
 * меню «Поделиться», и его не ищут, пока не скажут.
 *
 * На витрине она живёт по правилам: не в установленном приложении, не на
 * первом заходе и не две недели после отказа. Сами правила — в
 * `src/lib/install.ts`, там же и тесты: в сторону навязчивости здесь ошибиться
 * легче всего.
 *
 * В профиле — постоянной карточкой (`always`), без кнопки отказа: это то
 * место, куда возвращается тот, кто на витрине отмахнулся. Установившему её не
 * показывают и там.
 *
 * На игровых страницах её нет вовсе и быть не должно: посреди партии отвлекать
 * нельзя.
 */

const ВИЗИТЫ = "install:visits";
const МОЛЧАНИЕ = "install:snooze";

const listeners = new Set<() => void>();

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

function emit(): void {
  for (const notify of listeners) notify();
}

/** Хранилище может быть заперто (приватный режим) — тогда просто молчим. */
function прочитать(ключ: string): number {
  try {
    return Number(window.localStorage.getItem(ключ) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function записать(ключ: string, значение: number): void {
  try {
    window.localStorage.setItem(ключ, String(значение));
  } catch {
    // Приватный режим — обойдёмся без памяти.
  }
}

/**
 * Что за браузер и пора ли предлагать — считается один раз за загрузку
 * страницы и запоминается. Снимок внешнего состояния обязан быть устойчивым,
 * иначе React перерисовывает без конца. Заодно это и есть «заход» — считать
 * его чаще было бы неправдой.
 */
interface Окружение {
  way: InstallWay;
  standalone: boolean;
  пора: boolean;
}

let окружение: Окружение | undefined;
let скрыто = false;

function измерить(): Окружение {
  const standalone = isStandalone(
    window.matchMedia("(display-mode: standalone)").matches,
    (window.navigator as Navigator & { standalone?: boolean }).standalone,
  );

  const visits = прочитать(ВИЗИТЫ) + 1;
  записать(ВИЗИТЫ, visits);

  return {
    standalone,
    пора: shouldOffer({
      standalone,
      visits,
      dismissedUntil: прочитать(МОЛЧАНИЕ),
      now: Date.now(),
    }),
    way: installWay({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      platform: navigator.platform,
    }),
  };
}

function окр(): Окружение {
  if (!окружение) окружение = измерить();
  return окружение;
}

/*
 * Два снимка, а не один с параметром: `useSyncExternalStore` требует
 * устойчивую ссылку на функцию, и оба возвращают строку или `null` — значение,
 * которое можно сравнивать напрямую.
 */
function снимокПоПравилам(): InstallWay | null {
  if (скрыто) return null;

  const o = окр();
  return o.standalone || !o.пора ? null : o.way;
}

/** Установившему не показываем и здесь — а вот отказ тут ни при чём. */
function снимокВсегда(): InstallWay | null {
  const o = окр();
  return o.standalone ? null : o.way;
}

function спрятать(): void {
  скрыто = true;
  emit();
}

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallHint({
  /**
   * Показывать всегда, не спрашивая правил. Так подсказка живёт в профиле:
   * это и есть тот постоянный пункт, к которому возвращается отмахнувшийся
   * (docs/BACKLOG.md E1).
   */
  always = false,
}: {
  always?: boolean;
} = {}) {
  /*
   * На сервере нет ни `navigator`, ни хранилища, поэтому первый снимок —
   * `null`: до ответа лучше не мигать подсказкой. Читается это тем, чем
   * положено, а не эффектом со `setState` — как в `HardcoreGate`.
   */
  const way = useSyncExternalStore(
    subscribe,
    always ? снимокВсегда : снимокПоПравилам,
    () => null,
  );

  const [deferred, setDeferred] = useState<InstallEvent | null>(null);

  /*
   * Событие андроида. Слушаем всегда, а не только когда подсказка видна:
   * приходит оно рано и один раз, и упустив его, кнопку показать будет нечем.
   */
  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Без этого Chrome покажет свою плашку и выберет момент за нас.
      event.preventDefault();
      setDeferred(event as InstallEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      спрятать();
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function отказаться() {
    записать(МОЛЧАНИЕ, snoozeUntil(Date.now()));
    спрятать();
  }

  async function установить() {
    if (!deferred) return;

    await deferred.prompt();
    await deferred.userChoice;

    // Событие одноразовое: второй раз `prompt` бросит исключение.
    setDeferred(null);
  }

  if (!way) return null;

  // На десктопе без кнопки говорить не о чем: инструкции там свои у каждого
  // браузера, и пересказывать их все — хуже, чем промолчать.
  if (way === "desktop" && !deferred) return null;

  return (
    <div
      role="region"
      aria-label="Установка приложения"
      className="mb-6 flex flex-col gap-3 rounded-xl border border-line bg-paper px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="font-semibold">Кутёж живёт и на домашнем экране</p>
        <p className="mt-1 text-balance text-muted">{ПОДСКАЗКА[way]}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {deferred && (
          <button
            type="button"
            onClick={установить}
            className="rounded-lg bg-accent px-4 py-2 font-semibold text-paper transition hover:bg-deep"
          >
            Установить
          </button>
        )}
        {/* В профиле отмахиваться не от чего: туда за этим и приходят. */}
        {!always && (
          <button
            type="button"
            onClick={отказаться}
            className="rounded-lg px-3 py-2 font-medium text-muted transition hover:text-ink"
          >
            Не сейчас
          </button>
        )}
      </div>
    </div>
  );
}

const ПОДСКАЗКА: Record<InstallWay, string> = {
  /*
   * Про повторный вход сказано прямо (E3): установленное на айфоне приложение
   * получает своё хранилище, отдельное от Safari, и человек окажется
   * разлогинен. Промолчать — значит получить поток «приложение сломалось».
   */
  "ios-safari":
    "Нажми «Поделиться» внизу экрана и выбери «На экран „Домой“». Войти придётся заново: приложение хранит вход отдельно от браузера.",

  /* Поставить с айфона можно только из Safari — врать про это нельзя. */
  "ios-other":
    "Открой эту страницу в Safari — поставить на домашний экран можно только оттуда.",

  /* Кнопка появится, если браузер прислал событие; не прислал — путь руками. */
  android:
    "Поставь его приложением — без адресной строки и с иконкой. Если кнопки нет, открой меню браузера и выбери «Установить приложение».",

  desktop: "Поставь его приложением — без адресной строки и с иконкой.",
};

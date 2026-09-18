"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Звук комнаты: ход, взятие, шах, конец, последние секунды и «твой ход».
 *
 * Звуки у всех игр одинаковые — так решил хозяин, — поэтому модуль
 * платформенный, а не копия в каждой игре. Своё у игры только место, где
 * лежит выбор «звук выключен»: ключ передаёт игра, и выбор, сделанный до
 * переезда модуля сюда, никуда не делся.
 *
 * Тоны собираются на месте, а не берутся файлами: ходу нужен щелчок, а не
 * запись, и лишних килобайт в бандле от этого нет. Понадобятся настоящие
 * сэмплы — их можно подложить сюда, ничего снаружи не меняя.
 *
 * Первый звук браузер заблокирует до первого касания, поэтому звук
 * разблокируется заранее: на первое же действие человека в странице
 * (src/games/chess/docs/BACKLOG.md G).
 */

export type Cue = "move" | "capture" | "check" | "end" | "lowTime" | "turn";

/** Из чего складывается каждый звук: частота, длительность и громкость. */
const CUES: Record<Cue, { hz: number[]; ms: number; gain: number }> = {
  move: { hz: [320], ms: 55, gain: 0.18 },
  capture: { hz: [190, 120], ms: 90, gain: 0.24 },
  check: { hz: [660, 880], ms: 110, gain: 0.22 },
  end: { hz: [520, 390, 260], ms: 220, gain: 0.26 },
  lowTime: { hz: [900], ms: 45, gain: 0.16 },
  // Зов, а не щелчок: слышно и из соседней вкладки, но не тревога.
  turn: { hz: [587, 880], ms: 150, gain: 0.3 },
};

/**
 * Выбор про звук — внешнее для React состояние: он лежит в хранилище браузера и
 * переживает перезагрузку. Поэтому читается он подпиской, а не эффектом: на
 * сервере звук всегда «включён», на клиенте — как решил человек, и разъехаться
 * первой отрисовке не на чем.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

function stored(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== "off";
  } catch {
    // Приватное окно или запрет на хранилище: звук по умолчанию есть.
    return true;
  }
}

export interface Sound {
  on: boolean;
  toggle: () => void;
  play: (cue: Cue) => void;
}

/**
 * @param storageKey где в хранилище браузера лежит выбор про звук. Ключ у
 * каждой игры свой: `chess:sound`, `turbochess:sound`, `pricetitute:sound`.
 */
export function useSound(storageKey: string): Sound {
  const on = useSyncExternalStore(
    subscribe,
    () => stored(storageKey),
    () => true,
  );
  const context = useRef<AudioContext | null>(null);

  // Браузер молчит, пока человек не тронул страницу. Заводим звук на первое же
  // касание — иначе первый ход соперника пройдёт беззвучно.
  useEffect(() => {
    const wake = () => {
      context.current ??= new AudioContext();
      void context.current.resume();
    };

    window.addEventListener("pointerdown", wake, { once: true });
    window.addEventListener("keydown", wake, { once: true });

    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(
        storageKey,
        stored(storageKey) ? "off" : "on",
      );
    } catch {
      // Не запомнить выбор неприятно, но звук от этого работать не перестаёт.
    }
    for (const listener of listeners) listener();
  }, [storageKey]);

  const play = useCallback(
    (cue: Cue) => {
      const audio = context.current;
      if (!on || !audio || audio.state !== "running") return;

      const { hz, ms, gain } = CUES[cue];
      hz.forEach((frequency, at) => {
        const start = audio.currentTime + (at * ms) / 1000;
        const tone = audio.createOscillator();
        const volume = audio.createGain();

        tone.type = "triangle";
        tone.frequency.value = frequency;
        // Затухание, а не обрыв: резко оборванный тон щёлкает.
        volume.gain.setValueAtTime(gain, start);
        volume.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000);

        tone.connect(volume).connect(audio.destination);
        tone.start(start);
        tone.stop(start + ms / 1000);
      });
    },
    [on],
  );

  return { on, toggle, play };
}

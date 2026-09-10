"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Звук партии: ход, взятие, шах, конец и последние секунды.
 *
 * Тоны собираются на месте, а не берутся файлами: ходу нужен щелчок, а не
 * запись, и лишних килобайт в бандле от этого нет. Понадобятся настоящие
 * сэмплы — их можно подложить сюда, ничего снаружи не меняя.
 *
 * Первый звук браузер заблокирует до первого касания, поэтому звук
 * разблокируется заранее: на первое же действие человека в странице
 * (src/games/chess/docs/BACKLOG.md G).
 */

export type Cue = "move" | "capture" | "check" | "end" | "lowTime";

/** Из чего складывается каждый звук: частота, длительность и громкость. */
const CUES: Record<Cue, { hz: number[]; ms: number; gain: number }> = {
  move: { hz: [320], ms: 55, gain: 0.18 },
  capture: { hz: [190, 120], ms: 90, gain: 0.24 },
  check: { hz: [660, 880], ms: 110, gain: 0.22 },
  end: { hz: [520, 390, 260], ms: 220, gain: 0.26 },
  lowTime: { hz: [900], ms: 45, gain: 0.16 },
};

const STORAGE = "chess:sound";

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

function stored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE) !== "off";
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

export function useSound(): Sound {
  const on = useSyncExternalStore(subscribe, stored, () => true);
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
      window.localStorage.setItem(STORAGE, stored() ? "off" : "on");
    } catch {
      // Не запомнить выбор неприятно, но звук от этого работать не перестаёт.
    }
    for (const listener of listeners) listener();
  }, []);

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

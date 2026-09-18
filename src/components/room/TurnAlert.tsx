"use client";

import { useEffect, useRef, useState } from "react";
import type { Sound } from "@/components/room/sound";
import { blinkTitle, turnEvent } from "@/lib/turn";

/**
 * Зов к ходу: попап, звук и мигающая вкладка.
 *
 * Правила одни на все игры, различается только набор:
 *
 * - **Попап** (`popup`) — «Твой ход» игроку и «Сейчас ходит <имя>» зрителю.
 *   Короткий и сквозной: не мешает ни доске, ни чату. Зрителю — без звука.
 * - **Звук** — только когда человек не смотрит на страницу: вкладка свёрнута
 *   или окно не в фокусе. Когда смотрит, соперник и так щёлкнул ходом, а
 *   второй звук поверх каждого хода в блице — шум.
 * - **Мигание вкладки** — пока ход мой и человек не на странице. Вернулся —
 *   заголовок встаёт прежний.
 * - **Напоминание** (`remindAt`) — ещё один звук к этому времени, если ход
 *   всё ещё мой и человек всё ещё не здесь: в платитутке — за несколько секунд
 *   до конца ставок.
 *
 * Когда что считается переходом очереди — `src/lib/turn.ts`.
 */

const CALL = "● Твой ход";
const TOAST_MS = 1800;
const BLINK_MS = 1000;

/** Человека нет на странице: вкладка скрыта или окно не в фокусе. */
function away(): boolean {
  return document.visibilityState === "hidden" || !document.hasFocus();
}

export function TurnAlert({
  turn,
  mine,
  watcher = null,
  sound,
  popup,
  remindAt = null,
}: {
  /**
   * Метка очереди: меняется, когда ход переходит, `null` — ходить некому,
   * `undefined` — снимка ещё нет.
   */
  turn: string | null | undefined;
  /** Очередь моя. */
  mine: boolean;
  /** Кто ходит — если я зритель. У игрока `null`. */
  watcher?: string | null;
  sound: Sound;
  popup: boolean;
  /** Когда напомнить звуком ещё раз, мс на часах клиента. */
  remindAt?: number | null;
}) {
  const [toast, setToast] = useState<{ text: string } | null>(null);
  const [seen, setSeen] = useState<string | null | undefined>(undefined);
  /** Сколько раз звали к ходу: эффект ниже слышит прибавку и звонит. */
  const [calls, setCalls] = useState(0);
  const rung = useRef(0);
  const { play } = sound;

  // Очередь сменилась — зовём. Подстройка состояния прямо в рендере, как в
  // чате: эффект ради setState здесь лишний.
  if (turn !== undefined && turn !== seen) {
    setSeen(turn);
    const event = turnEvent(seen, turn, mine, watcher !== null);
    if (event === "mine") {
      setCalls((was) => was + 1);
      if (popup) setToast({ text: "Твой ход" });
    } else if (event === "watch" && popup) {
      setToast({ text: `Сейчас ходит ${watcher}` });
    }
  }

  // Звук — наружу, поэтому в эффекте. Только если человека нет на странице.
  useEffect(() => {
    if (calls === rung.current) return;
    rung.current = calls;
    if (away()) play("turn");
  }, [calls, play]);

  // Попап гаснет сам.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Напоминание к сроку.
  const waiting = turn !== undefined && turn !== null && mine;
  useEffect(() => {
    if (!waiting || remindAt === null) return;
    const wait = remindAt - Date.now();
    if (wait <= 0) return;

    const timer = window.setTimeout(() => {
      if (away()) play("turn");
    }, wait);
    return () => window.clearTimeout(timer);
  }, [waiting, remindAt, play]);

  // Мигание вкладки, пока ход мой, а человека нет.
  useEffect(() => {
    if (!waiting) return;

    let timer: number | null = null;
    let title = "";
    let tick = 0;

    const stop = () => {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
      document.title = title;
    };
    const start = () => {
      if (timer !== null || !away()) return;
      title = document.title;
      tick = 0;
      document.title = blinkTitle(tick, CALL, title);
      timer = window.setInterval(() => {
        tick += 1;
        document.title = blinkTitle(tick, CALL, title);
      }, BLINK_MS);
    };
    const check = () => (away() ? start() : stop());

    start();
    window.addEventListener("blur", check);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);

    return () => {
      window.removeEventListener("blur", check);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      stop();
    };
  }, [waiting]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4"
    >
      <p className="max-w-full truncate rounded-full bg-accent px-5 py-2.5 text-base font-semibold text-paper shadow-lg">
        {toast.text}
      </p>
    </div>
  );
}

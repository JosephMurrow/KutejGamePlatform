"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { enoughVisible, unreadLabel } from "@/lib/unread";
import { CHAT_MAX_LENGTH, type ChatMessagePayload } from "@/shared/protocol";

/** Запас в пикселях, в пределах которого лента считается прокрученной вниз. */
const BOTTOM_SLACK = 24;

/** Шаг отслеживания видимости: нужен частый, счёт идёт в пикселях. */
const THRESHOLDS = Array.from({ length: 21 }, (_, step) => step / 20);

export function Chat({
  messages,
  youId,
  badge,
  onSend,
}: {
  messages: ChatMessagePayload[];
  youId: string;
  /**
   * Значок перед ником: корона, звание, что угодно. Чат платформенный и про
   * заслуги игрока ничего не знает — рисует игра (docs/BACKLOG.md A1).
   */
  badge?: (playerId: string) => ReactNode;
  onSend: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [onScreen, setOnScreen] = useState(true);
  const [seenCount, setSeenCount] = useState(messages.length);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Прочитанным считается только то, что человек действительно мог увидеть:
  // лента внизу и сама лента перед глазами. Одной прокрутки мало — на телефоне
  // чат уезжает под игровое поле, и там лента стоит внизу, никем не читаемая.
  const canSee = atBottom && onScreen;

  // Подстройка состояния прямо в рендере — штатный приём React, эффект здесь
  // был бы лишним.
  if (canSee && seenCount !== messages.length) {
    setSeenCount(messages.length);
  }

  const unreadCount = Math.max(0, messages.length - seenCount);
  const unread = unreadCount > 0 ? messages.at(-1) : undefined;

  // Видно ли ленту. Считаем по самой ленте, а не по ширине экрана: на планшете
  // разметка десктопная, но чат всё равно может оказаться за нижним краем.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;

        setOnScreen(
          enoughVisible(
            entry.boundingClientRect.height,
            entry.intersectionRect.height,
          ),
        );
      },
      { threshold: THRESHOLDS },
    );
    observer.observe(list);

    return () => observer.disconnect();
  }, []);

  // Прокручиваем только саму ленту и только когда человек и так внизу.
  // Прежний scrollIntoView тащил за собой всю страницу, и на телефоне это
  // выглядело как рывок вёрстки при каждом сообщении.
  useEffect(() => {
    if (!atBottom) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, atBottom]);

  function scrollToBottom() {
    const list = listRef.current;
    if (!list) return;

    list.scrollTop = list.scrollHeight;
    setAtBottom(true);
  }

  /** Подтащить к чату и страницу, и саму ленту: иначе доедешь до половины. */
  function focusChat() {
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    scrollToBottom();
  }

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    const sent = await onSend(trimmed);
    setBusy(false);

    if (sent) {
      setText("");
      // Своё сообщение показываем всегда, даже если человек читал середину.
      scrollToBottom();
    }
  }

  return (
    <div className="flex min-h-0 flex-col rounded-2xl border border-line bg-paper">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-muted">
        Чат
      </h2>

      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={(event) => {
            const list = event.currentTarget;
            const bottom =
              list.scrollHeight - list.scrollTop - list.clientHeight <=
              BOTTOM_SLACK;
            setAtBottom(bottom);
          }}
          className="flex max-h-64 min-h-24 flex-col gap-2 overflow-y-auto p-3 lg:max-h-80"
        >
          {messages.length === 0 && (
            <p className="py-4 text-center text-xs text-muted">
              Пока тихо. Скажи что-нибудь.
            </p>
          )}

          {messages.map((message) => {
            return (
              <div key={message.id} className="flex items-start gap-2">
                <Avatar id={message.avatarId} size={24} className="mt-0.5" />
                <p className="min-w-0 flex-1 break-words text-sm">
                  {badge?.(message.playerId)}
                  <span
                    className={`mr-1 font-medium ${
                      message.playerId === youId ? "text-accent" : "text-muted"
                    }`}
                  >
                    {message.nickname}
                  </span>
                  {message.text}
                </p>
              </div>
            );
          })}
        </div>

        {unread && onScreen && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute inset-x-3 bottom-2 truncate rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-paper shadow-lg transition hover:bg-deep"
          >
            {unreadLabel(unreadCount, unread.nickname)}
          </button>
        )}
      </div>

      {/*
        Чат уехал за экран — облачко переезжает к верхнему краю окна. Именно
        к верхнему: внизу поле ставки и кнопка «Поставить», и перекрывать их
        ради подсказки о чате нельзя.
      */}
      {unread && !onScreen && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-3">
          <button
            type="button"
            onClick={focusChat}
            className="pointer-events-auto max-w-full truncate rounded-full bg-accent px-4 py-2 text-xs font-medium text-paper shadow-lg transition hover:bg-deep"
          >
            ↓ {unreadLabel(unreadCount, unread.nickname)}
          </button>
        </div>
      )}

      <div className="flex gap-2 border-t border-line p-3">
        <input
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="Сообщение"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent"
        />
        <button
          type="button"
          disabled={busy || text.trim() === ""}
          onClick={() => void submit()}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-paper transition hover:bg-deep disabled:opacity-50"
        >
          Отправить
        </button>
      </div>
    </div>
  );
}

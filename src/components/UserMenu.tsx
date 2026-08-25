"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { logoutAction } from "@/lib/auth/actions";

const LINKS = [
  { href: "/play", label: "В общую комнату" },
  { href: "/rooms/new", label: "Своя комната" },
  { href: "/leaderboard", label: "Рейтинг" },
  { href: "/profile", label: "Профиль" },
] as const;

/** Пункт, который в комнате открывает окно вместо перехода. */
const OVERLAY_HREF = "/leaderboard";

/**
 * Кнопка с меню вместо россыпи ссылок в шапке: переходы между комнатами,
 * рейтинг, профиль и выход в одном месте.
 */
export function UserMenu({
  nickname,
  avatarId,
  onLeaderboard,
}: {
  nickname: string;
  avatarId: number;
  /**
   * Показать рейтинг, не уходя со страницы. Передаётся из комнаты: переход по
   * ссылке рвёт сокет, и человек теряет место за столом.
   */
  onLeaderboard?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-xl border border-line bg-paper py-1.5 pl-2 pr-3 transition hover:border-crimson"
      >
        <Avatar id={avatarId} size={28} />
        <span className="max-w-28 truncate text-sm font-medium sm:max-w-40">
          {nickname}
        </span>
        <svg
          viewBox="0 0 12 12"
          width="10"
          height="10"
          aria-hidden="true"
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M2 4.5 L6 8.5 L10 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        // z-50, иначе меню уходит под карточку вопроса.
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-paper py-1 shadow-lg"
        >
          {LINKS.map((link) =>
            link.href === OVERLAY_HREF && onLeaderboard ? (
              <button
                key={link.href}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onLeaderboard();
                }}
                className="block w-full px-4 py-2.5 text-left text-sm transition hover:bg-tint hover:text-crimson"
              >
                {link.label}
              </button>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-sm transition hover:bg-tint hover:text-crimson"
              >
                {link.label}
              </Link>
            ),
          )}

          <form action={logoutAction} className="border-t border-line">
            <button
              type="submit"
              role="menuitem"
              className="w-full px-4 py-2.5 text-left text-sm text-muted transition hover:bg-tint hover:text-crimson"
            >
              Выйти
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

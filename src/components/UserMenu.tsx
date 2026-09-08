"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Modal } from "@/components/ui/Modal";
import { logoutAction } from "@/lib/auth/actions";

export interface MenuLink {
  href: string;
  label: string;
  /**
   * Открывать окном, а не переходом. Нужно там, где уход со страницы рвёт
   * сокет: рейтинг в комнате именно поэтому и переехал в модалку.
   */
  overlay?: boolean;
}

/** Пункты платформы. Игра добавляет свои сверху. */
const PLATFORM_LINKS: readonly MenuLink[] = [
  { href: "/join", label: "Зайти по коду" },
  { href: "/profile", label: "Профиль" },
];

/** Дорога с игры на витрину. Она обязана быть в каждой игре. */
const SHELF: MenuLink = { href: "/games", label: "Выйти в меню выбора игр" };

/**
 * Кнопка с меню вместо россыпи ссылок в шапке: переходы между комнатами,
 * рейтинг, профиль и выход в одном месте.
 */
export function UserMenu({
  nickname,
  avatarId,
  isGuest = false,
  links = [],
  onOverlay,
  confirmExit,
}: {
  nickname: string;
  avatarId: number;
  /**
   * Гость стримерской комнаты. Ему доступна только она: ни общего зала, ни
   * своей комнаты, ни рейтинга, ни профиля — и предлагать их в меню значит
   * обещать несуществующее.
   */
  isGuest?: boolean;
  /** Пункты игры: платформа своих добавит сама. */
  links?: readonly MenuLink[];
  /** Открыть окно вместо перехода — для пунктов с `overlay`. */
  onOverlay?: (href: string) => void;
  /**
   * Спросить перед уходом на витрину. Передаёт игра, когда партия идёт: уход
   * рвёт сокет и высаживает из-за стола.
   */
  confirmExit?: string;
}) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
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
          {(isGuest ? [] : [...links, ...PLATFORM_LINKS]).map((link) =>
            link.overlay && onOverlay ? (
              <button
                key={link.href}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onOverlay(link.href);
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

          {/*
            Выход на витрину платформа рисует сама: человек, доигравший
            партию, не должен искать дорогу в адресной строке. Гостю его не
            показываем — витрина для него закрыта, а уход из комнаты его
            попросту стирает.
          */}
          {!isGuest &&
            (confirmExit ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setAsking(true);
                }}
                className="block w-full border-t border-line px-4 py-2.5 text-left text-sm transition hover:bg-tint hover:text-crimson"
              >
                {SHELF.label}
              </button>
            ) : (
              <Link
                href={SHELF.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block border-t border-line px-4 py-2.5 text-sm transition hover:bg-tint hover:text-crimson"
              >
                {SHELF.label}
              </Link>
            ))}

          {isGuest && (
            <p className="px-4 py-2.5 text-xs text-muted">
              Гость: только эта комната. Очки остаются здесь.
            </p>
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

      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        title="Выйти в меню игр?"
      >
        <p className="text-sm text-muted">{confirmExit}</p>
        <div className="mt-4 flex gap-2">
          <Link
            href={SHELF.href}
            className="rounded-lg bg-crimson px-4 py-2 text-sm font-semibold text-paper transition hover:bg-deep"
          >
            Выйти
          </Link>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="rounded-lg border border-line px-4 py-2 text-sm transition hover:border-crimson"
          >
            Остаться
          </button>
        </div>
      </Modal>
    </div>
  );
}

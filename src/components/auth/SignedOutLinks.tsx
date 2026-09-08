import Link from "next/link";

/** Вход и регистрация в шапке — для тех, кто ещё не с нами. */
export function SignedOutLinks() {
  return (
    <span className="flex items-center gap-2">
      <Link
        href="/login"
        className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:border-crimson"
      >
        Войти
      </Link>
      <Link
        href="/register"
        className="rounded-lg bg-crimson px-3 py-1.5 text-sm font-semibold text-paper transition hover:bg-deep"
      >
        Начать играть
      </Link>
    </span>
  );
}

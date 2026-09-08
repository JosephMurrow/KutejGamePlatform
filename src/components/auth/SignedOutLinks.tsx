import { ButtonLink } from "@/components/ui/Button";

/** Вход и регистрация в шапке — для тех, кто ещё не с нами. */
export function SignedOutLinks() {
  return (
    <span className="flex items-center gap-2">
      <ButtonLink href="/login" look="secondary" className="px-4 py-2">
        Войти
      </ButtonLink>
      <ButtonLink href="/register" className="px-4 py-2">
        Начать играть
      </ButtonLink>
    </span>
  );
}

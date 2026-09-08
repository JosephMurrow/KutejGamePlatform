import type { Metadata } from "next";
import Link from "next/link";
import { PLATFORM } from "@/components/Brand";
import { ForgotForm } from "@/components/auth/ForgotForm";

export const metadata: Metadata = {
  title: `Забыл пароль — ${PLATFORM}`,
};

export default function ForgotPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Забыл пароль</h1>
      <p className="mb-6 text-sm text-muted">
        Введи логин или адрес почты — пришлём ссылку для нового пароля.
      </p>

      <ForgotForm />

      <p className="mt-6 text-center text-sm text-muted">
        Вспомнил?{" "}
        <Link
          href="/login"
          className="font-medium text-crimson hover:underline"
        >
          Войти
        </Link>
      </p>
    </>
  );
}

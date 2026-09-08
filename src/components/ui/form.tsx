"use client";

import { useFormStatus } from "react-dom";

export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  autoComplete,
  hint,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  autoComplete?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        className={`w-full rounded-lg border bg-surface px-3 py-2.5 text-ink outline-none transition placeholder:text-muted focus:border-accent ${
          error ? "border-accent" : "border-line"
        }`}
      />
      {hint && !error && (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      )}
      {error && <span className="mt-1 block text-xs text-accent">{error}</span>}
    </label>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-paper transition hover:bg-deep disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Секунду…" : children}
    </button>
  );
}

export function FormError({ children }: { children?: string }) {
  if (!children) return null;

  return (
    <p className="rounded-lg border border-accent/30 bg-tint px-3 py-2 text-sm text-deep">
      {children}
    </p>
  );
}

export function FormOk({ children }: { children?: string }) {
  if (!children) return null;

  return (
    <p className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">
      {children}
    </p>
  );
}

export { PLATFORM } from "@/lib/brand";

/**
 * Знак платформы. Акцент пока малиновый — общий с игрой; своим он станет
 * вместе с фиолетовой темой витрины (docs/BACKLOG.md D1).
 */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight ${className ?? ""}`}>
      Кут<span className="text-accent">ёж</span>
    </span>
  );
}

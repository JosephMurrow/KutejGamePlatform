import { PRICETITUTE } from "../manifest";

/**
 * Знак платитутки. В интерфейсе имя всегда русское; латинское Pricetitute
 * остаётся только именем репозитория.
 */
export const BRAND = PRICETITUTE.title;

export function GameBrand({ className }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight ${className ?? ""}`}>
      Плати<span className="text-crimson">тутка</span>
    </span>
  );
}

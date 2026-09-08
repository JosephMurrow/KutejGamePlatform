export { BRAND } from "@/lib/brand";

export function Brand({ className }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight ${className ?? ""}`}>
      Плати<span className="text-crimson">тутка</span>
    </span>
  );
}

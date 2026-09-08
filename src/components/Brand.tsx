import Image from "next/image";
import { PLATFORM } from "@/lib/brand";

export { PLATFORM } from "@/lib/brand";

/**
 * Знак платформы — вордмарк из логотипа (docs/DESIGN.md).
 *
 * Картинкой, а не текстом: буквы «Кутежа» нарисованы от руки, шрифтом их не
 * набрать. Лента и предметы из полного логотипа сюда не идут — в строке шапки
 * они превращаются в грязь; полный знак живёт в `public/brand/logo.png`.
 *
 * Размер задаётся высотой: `className` обязан нести `h-*`, ширину картинка
 * считает сама. Пропорции знака не трогаем.
 */
export function Brand({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/wordmark.png"
      alt={PLATFORM}
      width={540}
      height={216}
      // Знак нигде не шире полутора сотен точек, а без подсказки Next тянет
      // вариант на 640 — вшестеро тяжелее, чем нужно.
      sizes="150px"
      priority
      className={`w-auto ${className ?? "h-8"}`}
    />
  );
}

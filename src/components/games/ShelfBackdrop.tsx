/**
 * Фон витрины: коты, совы и рожицы силуэтами.
 *
 * Требование к нему одно и жёсткое — он не мешает выбирать игру
 * (docs/BACKLOG.md D4). Отсюда три решения:
 *
 * 1. Силуэты живут по краям, за пределами колонки с коробками. На широком
 *    экране они в полях, на узком — часть просто не показывается.
 * 2. Прозрачность низкая, цвет — акцент темы: фон остаётся фоном.
 * 3. Слой не ловит указатель и скрыт от читалки: он декорация.
 */

/** Кот: уши треугольниками, круглая морда. */
function Cat({ className }: { className?: string }) {
  return (
    <g className={className}>
      <path d="M14 18 L20 4 L30 14 L44 14 L54 4 L60 18 Z" />
      <circle cx="37" cy="40" r="26" />
    </g>
  );
}

/** Сова: вытянутая голова, кисточки, большие глаза-выемки. */
function Owl({ className }: { className?: string }) {
  return (
    <g className={className}>
      <path d="M12 16 L22 2 L30 14 L46 14 L54 2 L62 16 Z" />
      <ellipse cx="37" cy="42" rx="28" ry="30" />
    </g>
  );
}

/** Рожица: просто круг. */
function Face({ className }: { className?: string }) {
  return (
    <g className={className}>
      <circle cx="36" cy="36" r="30" />
    </g>
  );
}

export function ShelfBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
        className="size-full fill-accent opacity-[0.13]"
      >
        {/* Левое поле */}
        <g transform="translate(20 90) scale(1.5)">
          <Cat />
        </g>
        <g transform="translate(30 430) scale(1.2)">
          <Owl />
        </g>
        <g transform="translate(50 760) scale(1.35)">
          <Face />
        </g>

        {/* Правое поле */}
        <g transform="translate(830 60) scale(1.3)">
          <Owl />
        </g>
        <g transform="translate(860 400) scale(1.45)">
          <Face />
        </g>
        <g transform="translate(820 740) scale(1.25)">
          <Cat />
        </g>

        {/*
          Верх и низ — за шапкой и под последней коробкой. На узком экране
          колонка занимает всю ширину, поэтому эти прячутся первыми.
        */}
        <g
          className="hidden sm:block"
          transform="translate(400 -20) scale(1.1)"
        >
          <Face />
        </g>
        <g
          className="hidden sm:block"
          transform="translate(620 930) scale(1.2)"
        >
          <Cat />
        </g>
        <g className="hidden sm:block" transform="translate(250 950) scale(1)">
          <Owl />
        </g>

        {/*
          Узкий экран: квадратный viewBox обрезается по бокам, и краевые
          силуэты уезжают за кадр целиком. Эти живут в середине — там, где
          обрезка ничего не съедает.
        */}
        <g className="sm:hidden" transform="translate(430 40) scale(1.4)">
          <Owl />
        </g>
        <g className="sm:hidden" transform="translate(400 860) scale(1.5)">
          <Cat />
        </g>
        <g className="sm:hidden" transform="translate(600 620) scale(1.1)">
          <Face />
        </g>
      </svg>
    </div>
  );
}

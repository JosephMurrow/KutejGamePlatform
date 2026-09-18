"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Modal } from "@/components/ui/Modal";
import { buildQr } from "@/lib/qr";

/** Подписываться не на что: гидратация случается один раз и сама. */
function subscribe(): () => void {
  return () => {};
}

/**
 * Приглашение: QR-код, ссылка и кнопка копирования.
 *
 * Компания обычно сидит за одним столом, и пересылать ссылку некуда — проще
 * показать экран: сосед наводит телефон и попадает в комнату, не набирая код
 * руками.
 */
export function InviteModal({
  open,
  onClose,
  link,
  hint,
}: {
  open: boolean;
  onClose: () => void;
  link: string;
  /** Строка под кодом: чем эта ссылка полезна. */
  hint: string;
}) {
  const [copied, setCopied] = useState(false);
  // Ссылку комнаты собирают из адресной строки, а её на сервере нет: там она
  // пустая, в браузере — настоящая, и первая отрисовка разъезжалась с серверной.
  // Поэтому до гидратации окно рисуется так же, как на сервере, — без ссылки, —
  // а сразу после неё показывает то, что пришло. Окно в эти мгновения закрыто,
  // и разницы никто не видит.
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const shown = hydrated ? link : "";
  const qr = useMemo(() => (shown ? buildQr(shown) : null), [shown]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Пригласить друга">
      <div className="flex flex-col items-center gap-4 p-5">
        {qr && (
          /*
            Код остаётся чёрным на белом даже внутри розовой карточки:
            читается он контрастом, и на цветном фоне телефоны капризничают.
          */
          <div className="rounded-xl bg-white p-3">
            <svg
              viewBox={`0 0 ${qr.size} ${qr.size}`}
              width={224}
              height={224}
              role="img"
              aria-label="QR-код со ссылкой на комнату"
              shapeRendering="crispEdges"
              className="block"
            >
              <path d={qr.path} fill="#000000" />
            </svg>
          </div>
        )}

        <p className="text-center text-xs text-muted">{hint}</p>

        <p className="tabular w-full truncate rounded-lg border border-line bg-surface px-3 py-2 text-center text-xs text-muted">
          {shown}
        </p>

        <button
          type="button"
          onClick={() => void copy()}
          className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-paper transition hover:bg-deep"
        >
          {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
        </button>
      </div>
    </Modal>
  );
}

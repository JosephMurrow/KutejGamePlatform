"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { buildQr } from "@/lib/qr";

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
  const qr = useMemo(() => (link ? buildQr(link) : null), [link]);

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

        <p className="tabular w-full truncate rounded-lg border border-line bg-blush px-3 py-2 text-center text-xs text-muted">
          {link}
        </p>

        <button
          type="button"
          onClick={() => void copy()}
          className="w-full rounded-xl bg-crimson px-4 py-3 text-sm font-semibold text-paper transition hover:bg-deep"
        >
          {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
        </button>
      </div>
    </Modal>
  );
}

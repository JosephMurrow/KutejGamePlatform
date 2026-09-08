"use client";

import Link from "next/link";
import { useState } from "react";
import { InviteModal } from "@/components/rooms/InviteModal";
import { ROUTES } from "../manifest";

/**
 * Общая комната, а в ней никого. Показываем, что делать дальше: позвать людей
 * или уйти играть с ботами в свою комнату.
 */
export function LonelyNotice() {
  const [inviteOpen, setInviteOpen] = useState(false);

  // Ссылка берётся из адресной строки: снаружи и изнутри сети адрес разный,
  // и правильный тот, по которому человек сюда пришёл.
  const link =
    typeof window === "undefined" ? "" : `${window.location.origin}/play`;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-paper p-6 text-center">
      <div>
        <h2 className="text-lg font-semibold">Ты тут один</h2>
        <p className="mx-auto mt-2 max-w-md text-balance text-sm leading-relaxed text-muted">
          Позови друзей — покажи им код с экрана или отправь ссылку, и играйте
          вместе. Или уходи в свою комнату: там можно сыграть с ботами.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="flex-1 rounded-xl bg-crimson px-4 py-2.5 text-sm font-semibold text-paper transition hover:bg-deep"
        >
          Позвать друга
        </button>

        <Link
          href={ROUTES.newRoom}
          className="flex-1 rounded-xl border border-line bg-paper px-4 py-2.5 text-sm font-semibold transition hover:border-crimson hover:text-crimson"
        >
          Своя комната с ботами
        </Link>
      </div>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        link={link}
        hint="Наведи камеру телефона — и окажешься здесь же, в общем зале."
      />
    </div>
  );
}

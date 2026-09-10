"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { fetchBoard } from "../../leaderboard/actions";
import type { BoardView } from "../../leaderboard/shape";
import { LeaderboardTable } from "./Table";

/**
 * Рейтинг поверх комнаты.
 *
 * Именно окном, а не переходом на страницу: переход рвёт сокет, и через
 * льготные пятнадцать секунд человек выпадает из-за доски. У платитутки на
 * этом уже обжигались (src/games/chess/docs/BACKLOG.md E2).
 */
export function LeaderboardModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [view, setView] = useState<BoardView | null>(null);
  const [failed, setFailed] = useState(false);

  // Ходим за данными, когда окно открыли. Это обращение к серверу, а не
  // вычисление из пропсов, — как раз работа для эффекта.
  useEffect(() => {
    if (!open) return;

    let alive = true;

    fetchBoard()
      .then((next) => {
        if (!alive) return;
        setView(next);
        setFailed(false);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;
    };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Рейтинг">
      <div className="flex flex-col gap-4 p-4">
        <p className="text-xs text-muted">
          Рейтинг зала считается только по партиям общего зала. «Всего» — это он
          же плюс надбавка за победы, в том числе в своих комнатах. Партии с
          ботом не считаются вовсе.
        </p>

        {failed ? (
          <p className="rounded-2xl border border-line bg-paper p-6 text-center text-sm text-muted">
            Рейтинг не загрузился. Попробуй ещё раз.
          </p>
        ) : view === null ? (
          <p className="p-6 text-center text-sm text-muted">Загружаем…</p>
        ) : (
          <LeaderboardTable board={view.board} viewerId={view.viewerId} />
        )}
      </div>
    </Modal>
  );
}

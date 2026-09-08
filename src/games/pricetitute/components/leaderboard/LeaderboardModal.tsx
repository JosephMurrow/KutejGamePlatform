"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  fetchLeaderboard,
  type LeaderboardView,
} from "@/games/pricetitute/leaderboard/actions";
import type { LeaderboardPeriod } from "@/shared/leaderboard";
import { LeaderboardTable } from "./LeaderboardTable";

/**
 * Рейтинг поверх комнаты.
 *
 * Нужен, чтобы посмотреть таблицу и не потерять место за столом: обычный
 * переход на страницу рвёт сокет, и через льготные пятнадцать секунд человек
 * выпадает из партии.
 */
export function LeaderboardModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState<LeaderboardPeriod>("all");
  const [view, setView] = useState<LeaderboardView | null>(null);
  const [failed, setFailed] = useState(false);

  // Ходим за данными, когда окно открыли или переключили период. Это обращение
  // к серверу, а не вычисление из пропсов, — как раз работа для эффекта.
  useEffect(() => {
    if (!open) return;

    let alive = true;

    // Состояние меняем только в ответе сервера. Гасить его прямо в теле
    // эффекта — лишний прогон отрисовки на ровном месте.
    fetchLeaderboard(period)
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
  }, [open, period]);

  return (
    <Modal open={open} onClose={onClose} title="Рейтинг общей комнаты">
      <div className="flex flex-col gap-4 p-4">
        <div className="flex gap-2">
          <Tab active={period === "all"} onSelect={() => setPeriod("all")}>
            За всё время
          </Tab>
          <Tab active={period === "week"} onSelect={() => setPeriod("week")}>
            За неделю
          </Tab>
        </div>

        <p className="text-xs text-muted">
          Очки из приватных комнат сюда не идут.
        </p>

        {failed ? (
          <p className="rounded-2xl border border-line bg-paper p-6 text-center text-sm text-muted">
            Рейтинг не загрузился. Попробуй ещё раз.
          </p>
        ) : view === null ? (
          <p className="p-6 text-center text-sm text-muted">Загружаем…</p>
        ) : (
          <LeaderboardTable
            board={view.board}
            viewerId={view.viewerId}
            titles={{
              allTimeChampionId: view.allTimeChampionId,
              weekChampionId: view.weekChampionId,
              leaders: new Set(),
            }}
          />
        )}
      </div>
    </Modal>
  );
}

function Tab({
  active,
  onSelect,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition ${
        active
          ? "border-accent bg-accent text-paper"
          : "border-line bg-paper hover:border-accent hover:text-accent"
      }`}
    >
      {children}
    </button>
  );
}

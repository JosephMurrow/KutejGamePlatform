import { Avatar } from "@/components/Avatar";
import {
  TOP_SIZE,
  type ChessBoard,
  type ChessRow,
} from "../../leaderboard/shape";

/**
 * Таблица рейтинга. Живёт отдельно от страницы, потому что показывается ещё и
 * в окне поверх комнаты: две копии разъехались бы при первой же правке.
 *
 * Без состояния и без хуков — годится и серверной странице, и клиентскому окну.
 */
export function LeaderboardTable({
  board,
  viewerId,
}: {
  board: ChessBoard;
  viewerId: string;
}) {
  if (board.rows.length === 0 && !board.you) {
    return (
      <p className="rounded-2xl border border-line bg-paper p-8 text-center text-sm text-muted">
        Рейтинг пока пуст. Сыграй партию в общем зале — и займёшь первое место.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-line bg-paper">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-xs text-muted sm:gap-3 sm:px-4">
          <span className="w-6 shrink-0">#</span>
          <span className="min-w-0 flex-1">Игрок</span>
          <span className="w-14 shrink-0 text-right">Зал</span>
          <span className="w-12 shrink-0 text-right">Партий</span>
          <span className="w-16 shrink-0 text-right">Всего</span>
        </div>

        <ul>
          {board.rows.map((row) => (
            <Row key={row.userId} row={row} you={row.userId === viewerId} />
          ))}
        </ul>

        {board.you && (
          <div className="border-t-2 border-dashed border-line">
            <Row row={board.you} you />
          </div>
        )}
      </div>

      {board.players > TOP_SIZE && (
        <p className="mt-3 text-center text-xs text-muted">
          Показаны первые {TOP_SIZE} из {board.players}
        </p>
      )}
    </>
  );
}

function Row({ row, you }: { row: ChessRow; you: boolean }) {
  return (
    <li
      className={`flex items-center gap-2 border-b border-line px-3 py-2.5 last:border-b-0 sm:gap-3 sm:px-4 ${
        you ? "bg-tint" : ""
      }`}
    >
      <span
        className={`tabular w-6 shrink-0 text-sm ${
          row.rank >= 1 && row.rank <= 3 ? "font-bold text-gold" : "text-muted"
        }`}
      >
        {row.rank > 0 ? row.rank : "—"}
      </span>

      <Avatar id={row.avatarId} size={32} className="shrink-0" />

      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {row.nickname}
        {you && <span className="ml-1 text-xs text-muted">· ты</span>}
      </span>

      <span className="tabular w-14 shrink-0 text-right text-sm">
        {row.rating}
        {/* Рейтинг ещё не устоялся: показываем с оговоркой и в верхушку не пускаем. */}
        {row.provisional && <span className="text-muted">?</span>}
      </span>
      <span className="tabular w-12 shrink-0 text-right text-sm text-muted">
        {row.games}
      </span>
      <span className="tabular w-16 shrink-0 text-right text-sm font-semibold text-accent">
        {row.sum.toFixed(1)}
      </span>
    </li>
  );
}

import { Avatar } from "@/components/Avatar";
import { Crown } from "@/components/game/Crown";
import { crownFor, type Titles } from "@/lib/game/crowns";
import {
  TOP_SIZE,
  type Leaderboard,
  type LeaderboardRow,
} from "@/shared/leaderboard";

/**
 * Таблица рейтинга. Живёт отдельно от страницы, потому что показывается ещё и
 * в окне поверх комнаты: две копии разъехались бы при первой же правке.
 *
 * Компонент без состояния и без хуков, поэтому одинаково годится и серверной
 * странице, и клиентскому окну.
 */
export function LeaderboardTable({
  board,
  viewerId,
  titles,
}: {
  board: Leaderboard;
  viewerId: string;
  titles: Titles;
}) {
  if (board.rows.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-paper p-8 text-center text-sm text-muted">
        {board.period === "week"
          ? "На этой неделе ещё никто не сыграл. Будь первым."
          : "Рейтинг пока пуст. Сыграй раунд — и займёшь первое место."}
      </p>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-line bg-paper">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-xs text-muted sm:gap-3 sm:px-4">
          <span className="w-6 shrink-0">#</span>
          <span className="min-w-0 flex-1">Игрок</span>
          <span className="w-12 shrink-0 text-right">Очки</span>
          <span className="w-14 shrink-0 text-right">Раунды</span>
        </div>

        <ul>
          {board.rows.map((row) => (
            <Row
              key={row.userId}
              row={row}
              you={row.userId === viewerId}
              titles={titles}
            />
          ))}
        </ul>

        {board.you && (
          <div className="border-t-2 border-dashed border-line">
            <Row row={board.you} you titles={titles} />
          </div>
        )}
      </div>

      {board.total > TOP_SIZE && (
        <p className="mt-3 text-center text-xs text-muted">
          Показаны первые {TOP_SIZE} из {board.total}
        </p>
      )}
    </>
  );
}

function Row({
  row,
  you,
  titles,
}: {
  row: LeaderboardRow;
  you: boolean;
  titles: Titles;
}) {
  const crown = crownFor(row.userId, titles);

  return (
    <li
      className={`flex items-center gap-2 border-b border-line px-3 py-2.5 last:border-b-0 sm:gap-3 sm:px-4 ${
        you ? "bg-tint" : ""
      }`}
    >
      <span
        className={`tabular w-6 shrink-0 text-sm ${
          row.rank <= 3 ? "font-bold text-gold" : "text-muted"
        }`}
      >
        {row.rank}
      </span>

      <Avatar id={row.avatarId} size={32} className="shrink-0" />

      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {crown && <Crown kind={crown} className="mr-1" />}
        {row.nickname}
        {you && <span className="ml-1 text-xs text-muted">· ты</span>}
      </span>

      <span className="tabular w-12 shrink-0 text-right text-sm font-semibold text-crimson">
        {row.points}
      </span>
      <span className="tabular w-14 shrink-0 text-right text-sm text-muted">
        {row.roundsPlayed}
      </span>
    </li>
  );
}

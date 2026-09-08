import { Avatar } from "@/components/Avatar";
import type { GameStatePayload } from "@/games/pricetitute/protocol";

/** Финальный экран приватной партии: победитель и итоговая таблица. */
export function Finished({
  state,
  onRestart,
}: {
  state: GameStatePayload;
  onRestart: () => void;
}) {
  const winners = state.winners ?? [];
  const champions = state.players.filter((player) =>
    winners.includes(player.id),
  );
  const standings = [...state.players].sort((a, b) => b.score - a.score);
  const youWon = winners.includes(state.youId);
  const youAreOwner = state.ownerId === state.youId;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-gold bg-gold/10 p-6 text-center">
        {champions.length === 0 ? (
          <p className="text-lg font-semibold">
            Партия окончена без победителя
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">
              {champions.length > 1 ? "Победили" : "Победил"}
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-4">
              {champions.map((player) => (
                <div key={player.id} className="flex flex-col items-center">
                  <Avatar id={player.avatarId} size={64} />
                  <p className="mt-1.5 font-bold">{player.nickname}</p>
                  <p className="tabular text-sm text-muted">
                    {player.score} очк.
                  </p>
                </div>
              ))}
            </div>

            {youWon && (
              <p className="mt-3 text-sm font-medium text-gold">
                Это ты. Поздравляем.
              </p>
            )}
          </>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-paper">
        <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold text-muted">
          Итог за {state.roundsPlayed} раундов
        </h2>

        <ul>
          {standings.map((player, index) => (
            <li
              key={player.id}
              className={`flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 ${
                player.id === state.youId ? "bg-tint" : ""
              }`}
            >
              <span className="tabular w-5 shrink-0 text-sm text-muted">
                {index + 1}
              </span>
              <Avatar id={player.avatarId} size={32} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {player.nickname}
              </span>
              <span className="tabular text-sm font-semibold text-crimson">
                {player.score}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {youAreOwner ? (
        <button
          type="button"
          onClick={onRestart}
          className="rounded-xl bg-crimson px-4 py-3 font-semibold text-paper transition hover:bg-deep"
        >
          Сыграть ещё раз
        </button>
      ) : (
        <p className="text-center text-sm text-muted">
          Новую партию начинает тот, кто создал комнату.
        </p>
      )}
    </div>
  );
}

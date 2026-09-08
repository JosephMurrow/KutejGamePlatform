import { Avatar } from "@/components/Avatar";
import { formatBet, isNever } from "@/games/pricetitute/engine/bet";
import { MAX_MISS_FACTOR } from "@/games/pricetitute/engine/scoring";
import type {
  GamePlayerPayload,
  RevealBetPayload,
  GameStatePayload,
} from "@/games/pricetitute/protocol";

/**
 * Вскрышка: ответ ведущего и все ставки разом. Длина полоски — насколько
 * игрок промахнулся по порядку величины.
 */
export function Reveal({ state }: { state: GameStatePayload }) {
  const reveal = state.reveal;
  if (!reveal) return null;

  const players = new Map(state.players.map((player) => [player.id, player]));

  const sorted = [...reveal.bets].sort((a, b) => {
    if (a.distance === null) return 1;
    if (b.distance === null) return -1;
    return a.distance - b.distance;
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-accent/30 bg-tint p-5 text-center">
        <p className="text-sm text-muted">Ведущий согласился бы за</p>
        <p
          className={`mt-1 text-3xl font-bold text-accent ${
            isNever(reveal.hostAnswer) ? "" : "tabular"
          }`}
        >
          {formatBet(reveal.hostAnswer)}
        </p>
      </div>

      <Outcome bets={sorted} players={players} />

      {reveal.betCount > sorted.length && (
        <p className="text-center text-xs text-muted">
          Показаны {sorted.length} ставок из {reveal.betCount} — ближайшие к
          ответу и твоя.
        </p>
      )}

      {sorted.length > 0 && (
        <ul className="flex flex-col gap-2">
          {sorted.map((bet, index) => {
            const player = players.get(bet.playerId);
            const share = accuracy(bet.distance, bet.won);

            return (
              <li
                key={bet.playerId}
                className={`reveal-row rounded-xl border p-3 ${
                  bet.won ? "border-gold bg-gold/10" : "border-line bg-paper"
                }`}
                style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
              >
                <div className="flex items-center gap-3">
                  <Avatar id={player?.avatarId ?? 0} size={32} />

                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {player?.nickname ?? "Игрок"}
                  </span>

                  <span
                    className={`text-sm font-semibold ${
                      isNever(bet.bet) ? "" : "tabular"
                    }`}
                  >
                    {formatBet(bet.bet)}
                  </span>

                  {bet.won && (
                    <span className="rounded-md bg-gold px-1.5 py-0.5 text-xs font-bold text-paper">
                      +1
                    </span>
                  )}
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-tint">
                    <div
                      className={`h-full rounded-full ${
                        bet.won ? "bg-gold" : "bg-accent-soft/60"
                      }`}
                      style={{ width: `${share * 100}%` }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right text-xs text-muted">
                    {miss(bet.distance, bet.won)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Итог раунда одной рамкой: кто взял очко. Все три исхода — победитель,
 * ничья, пустой раунд — живут в ней же. Два разных способа сказать про один и
 * тот же итог на одном экране только сбивают с толку.
 */
function Outcome({
  bets,
  players,
}: {
  bets: readonly RevealBetPayload[];
  players: ReadonlyMap<string, GamePlayerPayload>;
}) {
  if (bets.length === 0) {
    return (
      <div className="reveal-row rounded-2xl border border-dashed border-line bg-paper p-4 text-center text-sm text-muted">
        Никто не успел поставить
      </div>
    );
  }

  const winners = bets.filter((bet) => bet.won);

  if (winners.length === 0) {
    return (
      <div className="reveal-row rounded-2xl border border-dashed border-line bg-paper p-4 text-center">
        <p className="text-sm font-semibold">Раунд без победителя</p>
        <p className="mt-1 text-xs text-muted">
          Никто не угадал достаточно близко. Очко достаётся, если промахнуться
          не больше чем в {MAX_MISS_FACTOR} раза.
        </p>
      </div>
    );
  }

  return (
    <div className="reveal-row rounded-2xl border-2 border-gold bg-gold/10 p-4">
      <p className="text-center text-xs font-semibold text-muted">
        {winners.length > 1 ? "Победители раунда" : "Победитель раунда"}
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {winners.map((bet) => {
          const player = players.get(bet.playerId);

          return (
            <li key={bet.playerId} className="flex items-center gap-3">
              <Avatar id={player?.avatarId ?? 0} size={40} />

              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {player?.nickname ?? "Игрок"}
                </p>
                <p className="text-xs text-muted">{miss(bet.distance, true)}</p>
              </div>

              <span
                className={`shrink-0 font-bold text-accent ${
                  isNever(bet.bet) ? "" : "tabular"
                }`}
              >
                {formatBet(bet.bet)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Длина полоски — точность, а не промах: у самого близкого она самая длинная.
 * Шкала абсолютная, промах в сто раз обнуляет полоску. Так строка не пляшет
 * от того, насколько плохо угадали остальные.
 */
const ZERO_AT = 2;

function accuracy(distance: number | null, won: boolean): number {
  // Когда ведущий отказался, а угадавших не нашлось, очко берёт самая большая
  // ставка: сравнивать её не с чем, но полоска должна быть полной.
  if (distance === null) return won ? 1 : 0;
  return Math.max(0, 1 - distance / ZERO_AT);
}

/** Промах словами: во сколько раз мимо. */
function miss(distance: number | null, won: boolean): string {
  if (distance === null) return won ? "самая большая ставка" : "вне сравнения";
  if (distance === 0) return "точно в цель";

  const times = Math.pow(10, distance);
  if (times < 10) return `мимо в ${times.toFixed(1)} раза`;
  return `мимо в ${Math.round(times).toLocaleString("ru-RU")} раз`;
}

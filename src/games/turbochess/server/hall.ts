import type {
  ActionOutcome,
  GameRoomSnapshot,
  GameRoomState,
} from "@/lib/games/engine";

/**
 * Общий зал, которого нет.
 *
 * У турбо-шахмат только приватные комнаты (docs/BACKLOG.md C1), но договор
 * платформы держит общий зал за каждой игрой: подключение без кода комнаты
 * она ведёт туда. Наши страницы так не подключаются никогда — но сокет может
 * позвать кто угодно, и за закрытой дверью должно быть пусто, а не партия без
 * настроек.
 *
 * Поэтому здесь закрытая дверь: никого не сажает, все действия отбивает и
 * отдаёт снимок, по которому видно, что это не стол. Правка платформы ради
 * этого не нужна — отказ живёт в движке.
 */
export class ClosedHall implements GameRoomState {
  join(): void {}

  leave(): void {}

  seated(): readonly string[] {
    return [];
  }

  deadline(): number | null {
    return null;
  }

  tick(): void {}

  act(): ActionOutcome {
    return {
      accepted: false,
      reason: "У турбо-шахмат нет общего зала — заведи свою комнату",
    };
  }

  remove(): ActionOutcome {
    return { accepted: false, reason: "Здесь никого нет" };
  }

  snapshot(): GameRoomSnapshot {
    return {
      deadline: null,
      phaseDurationMs: null,
      playerCount: 0,
      players: [],
      extra: { phase: "closed", mode: null, options: null, seats: 0 },
    };
  }

  settled(): Promise<void> {
    return Promise.resolve();
  }

  stop(): void {}
}

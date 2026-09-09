import { randomUUID } from "node:crypto";
import type { GameRoomContext, GameServer } from "@/lib/games/engine";
import { env } from "@/lib/env";
import { BOT_AVATAR_OFFSET } from "../bots/avatars";
import { LEVELS, type LevelId } from "../bots/levels";
import { EnginePool } from "../bots/pool";
import { bookMove } from "../bots/book";
import { chooseMove, variantsFor } from "../bots/blunder";
import { defaultRoomSettings, type ChessRoomSettings } from "../rooms/settings";
import { saveMatch } from "../rooms/matches";
import { GLOBAL_ROOM } from "../protocol";
import { ChessLobby } from "./lobby";
import { ChessRoom, type BotSeat, type MatchDraft } from "./room";

/**
 * Серверная часть шахмат: живые партии и всё, что игра держит у себя на весь
 * срок жизни процесса.
 *
 * Комнат два сорта. Приватная — это одна доска и двое за ней; общий зал — одна
 * платформенная комната, внутри которой досок столько, сколько пар нашлось
 * (src/games/chess/docs/BACKLOG.md A1). Движок ботов появится своим этапом.
 */
class ChessServer implements GameServer {
  private readonly rooms = new Map<string, ChessRoom | ChessLobby>();
  /** Записи, которые ещё не доехали до базы. */
  private readonly writing = new Set<Promise<void>>();
  /**
   * Движки на все партии сразу. Пул общий на процесс: он и должен быть узким
   * местом, иначе десяток партий с ботами положит сокеты всем остальным
   * (src/games/chess/docs/BACKLOG.md D1).
   */
  private readonly engines = new EnginePool(env.CHESS_ENGINE_PATH);

  createRoom(context: GameRoomContext): Promise<ChessRoom | ChessLobby> {
    // Настройки приносит платформа — той формы, какой их отдал наш серверный
    // манифест. Если комната старее настроек, играем умолчанием.
    const settings = (context.settings ??
      defaultRoomSettings()) as ChessRoomSettings;

    // Общий зал устроен иначе: одна комната, а досок в ней много сразу
    // (src/games/chess/docs/BACKLOG.md A1).
    const record = (draft: MatchDraft) => this.record(draft, settings);
    const room =
      context.key === GLOBAL_ROOM
        ? new ChessLobby(context, undefined, record)
        : new ChessRoom(
            context,
            settings,
            undefined,
            record,
            this.botFor(settings),
          );

    this.rooms.set(context.key, room);

    return Promise.resolve(room);
  }

  closeRoom(key: string): void {
    this.rooms.delete(key);
  }

  stop(): void {
    this.rooms.clear();
    this.engines.stop();
  }

  /**
   * Бот для этой комнаты — если играют с ним и если движок вообще есть.
   *
   * Нет движка — нет и бота: комната тогда ждёт живого соперника, а не висит с
   * фигурой, которая не ходит.
   */
  private botFor(settings: ChessRoomSettings): BotSeat | undefined {
    if (settings.opponent !== "BOT" || !this.engines.available)
      return undefined;

    const level = LEVELS[settings.botLevel.toLowerCase() as LevelId];

    return {
      id: `bot:${randomUUID()}`,
      nickname: level.title,
      avatarId: BOT_AVATAR_OFFSET,
      level,
      think: async (fen, chosen, position) => {
        // Сначала книга: без неё бот на слабых уровнях ходит крайними пешками
        // и перестаёт быть похожим на человека с третьего хода
        // (src/games/chess/docs/BACKLOG.md D2).
        const known = await bookMove(settings.botLevel, position);
        if (known) return known;

        const candidates = await this.engines.candidates({
          fen,
          elo: chosen.elo,
          nodes: chosen.nodes,
          variants: variantsFor(chosen),
        });

        return chooseMove(candidates, chosen);
      },
    };
  }

  /**
   * Записать партию.
   *
   * Ошибка записи гасится: история важна, но уронить из-за неё живую комнату
   * важнее не дать. Незаписанная партия видна в логе.
   */
  private record(draft: MatchDraft, settings: ChessRoomSettings): void {
    const writing = saveMatch({
      ...draft,
      timeControl: settings.timeControl,
    }).catch((error: unknown) => {
      console.error(`[chess ${draft.roomKey}] партия не записана:`, error);
    });

    this.writing.add(writing);
    void writing.finally(() => this.writing.delete(writing));
  }
}

/**
 * Ведущего платформа даёт для чата от имени ботов — шахматам он понадобится
 * вместе с ними (src/games/chess/docs/PLAN.md, этап 8), а пока не берём.
 */
export function createChessServer(): GameServer {
  return new ChessServer();
}

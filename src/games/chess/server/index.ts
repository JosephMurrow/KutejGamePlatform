import type { GameRoomContext, GameServer } from "@/lib/games/engine";
import { defaultRoomSettings, type ChessRoomSettings } from "../rooms/settings";
import { saveMatch } from "../rooms/matches";
import { ChessRoom, type MatchDraft } from "./room";

/**
 * Серверная часть шахмат: живые партии и всё, что игра держит у себя на весь
 * срок жизни процесса. Пока держать нечего — движок ботов и пул процессов
 * появятся на своём этапе (src/games/chess/docs/PLAN.md, этап 7).
 */
class ChessServer implements GameServer {
  private readonly rooms = new Map<string, ChessRoom>();
  /** Записи, которые ещё не доехали до базы. */
  private readonly writing = new Set<Promise<void>>();

  createRoom(context: GameRoomContext): Promise<ChessRoom> {
    // Настройки приносит платформа — той формы, какой их отдал наш серверный
    // манифест. Если комната старее настроек, играем умолчанием.
    const settings = (context.settings ??
      defaultRoomSettings()) as ChessRoomSettings;

    const room = new ChessRoom(context, settings, undefined, (draft) =>
      this.record(draft, settings),
    );
    this.rooms.set(context.key, room);

    return Promise.resolve(room);
  }

  closeRoom(key: string): void {
    this.rooms.delete(key);
  }

  stop(): void {
    this.rooms.clear();
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

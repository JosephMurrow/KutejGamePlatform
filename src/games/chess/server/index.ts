import { randomUUID } from "node:crypto";
import type { GameHost, GameRoomContext, GameServer } from "@/lib/games/engine";
import { env } from "@/lib/env";
import { BOT_AVATAR_OFFSET } from "../bots/avatars";
import { LEVELS, type LevelId } from "../bots/levels";
import { EnginePool } from "../bots/pool";
import { bookMove } from "../bots/book";
import { chooseMove, variantsFor } from "../bots/blunder";
import { CHARACTER_TRAITS, hasStyle, nicknameOf } from "../bots/characters";
import { LINES } from "../bots/lines";
import { MAGNUS } from "../bots/lines/magnus";
import { cheatsOf, ODDS, perfect, type Say } from "../bots/magnus";
import { CHARACTERS, type Character } from "../bots/moments";
import { preferStyle } from "../bots/style";
import { Talker } from "../bots/talk";
import { pauseAfter } from "../bots/tempo";
import { Watcher } from "../bots/watch";
import { ChessGame } from "../engine/rules";
import {
  defaultRoomSettings,
  MOVE_LIMIT_MS,
  type ChessRoomSettings,
} from "../rooms/settings";
import { saveMatch } from "../rooms/matches";
import { applyMatch } from "../rating/apply";
import { shownRating } from "../rating/read";
import { GLOBAL_ROOM } from "../protocol";
import { ChessLobby } from "./lobby";
import { ChessRoom, type BotSeat, type MatchDraft } from "./room";
import type { Candidate } from "../bots/engine";

/**
 * Серверная часть шахмат: живые партии и всё, что игра держит у себя на весь
 * срок жизни процесса.
 *
 * Комнат два сорта. Приватная — это одна доска и двое за ней; общий зал — одна
 * платформенная комната, внутри которой досок столько, сколько пар нашлось
 * (src/games/chess/docs/BACKLOG.md A1). Здесь же собирается бот: уровень даёт
 * силу, характер — манеру и голос.
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

  constructor(private readonly host: GameHost) {}

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
        ? new ChessLobby(context, undefined, record, shownRating)
        : new ChessRoom(
            context,
            settings,
            undefined,
            record,
            this.botFor(settings, context.key),
            shownRating,
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
  private botFor(
    settings: ChessRoomSettings,
    roomKey: string,
  ): BotSeat | undefined {
    if (settings.opponent !== "BOT" || !this.engines.available)
      return undefined;

    const level = LEVELS[settings.botLevel.toLowerCase() as LevelId];
    // Скрытый пятый уровень — не характер, а отдельная шутка: свой набор
    // реплик, свои приёмы и никакой манеры, кроме лучшего хода
    // (src/games/chess/docs/BACKLOG.md D3).
    const magnus = level.id === "magnus";
    // Характер от уровня не зависит: слабый педант и сильное быдло одинаково
    // возможны (src/games/chess/docs/BACKLOG.md D4).
    const character = someone();
    const traits = CHARACTER_TRAITS[character];
    const id = `bot:${randomUUID()}`;
    const nickname = magnus ? level.title : nicknameOf(character);
    const avatarId = BOT_AVATAR_OFFSET;
    const limitMs = MOVE_LIMIT_MS[settings.timeControl];

    const talker = new Talker<string>(
      magnus ? MAGNUS : (LINES[character] as Record<string, string[]>),
    );
    const watcher = new Watcher();
    /**
     * Оценка позиции после прошлого хода бота. По тому, насколько она
     * изменилась, виден зевок соперника: движка на стороне человека нет, а
     * сравнить есть с чем.
     */
    let before: number | null = null;

    /** Сказать вслух; `false` — реплику проглотила пауза. */
    const speak: Say = (moment, ply, fill) => {
      const line = talker.say(moment, ply);
      if (!line) return false;

      this.host.sendChat(roomKey, {
        id: randomUUID(),
        playerId: id,
        nickname,
        avatarId,
        text: fill ? patch(line, fill) : line,
        at: Date.now(),
      });

      return true;
    };

    /** Наблюдение вслух: несказанное не считается сказанным. */
    const notice = (facts: Parameters<Watcher["before"]>[0], ply: number) => {
      const moment = watcher.before(facts);
      if (moment && speak(moment, ply)) watcher.spoke(moment);
    };

    return {
      id,
      nickname,
      avatarId,
      level,
      speak,
      cheats: magnus ? cheatsOf(speak) : undefined,
      restart: () => {
        talker.reset();
        watcher.reset();
        before = null;
      },
      think: async (turn, chosen) => {
        const started = Date.now();

        // Сначала книга: без неё бот на слабых уровнях ходит крайними пешками
        // и перестаёт быть похожим на человека с третьего хода
        // (src/games/chess/docs/BACKLOG.md D2).
        // Безошибочный эндшпиль: в позиции на семь фигур и меньше он не
        // считает, а смотрит в готовые таблицы — и объявляет мат в N.
        if (magnus) {
          const table = await perfect(turn.fen);
          if (table) {
            if (table.mateIn !== null) {
              speak("tablebase", turn.ply, { ходов: String(table.mateIn) });
            }
            await rest(started, [], 1, limitMs);

            return table.move;
          }
        }

        const known = await bookMove(settings.botLevel, turn.position);
        if (known) {
          notice({ ...turn, inBook: true, drift: null }, turn.ply);
          // Книжный ход известен заранее, но выпаливать его мгновенно нельзя:
          // за доской так не отвечают (D5).
          await rest(started, [], traits.tempo, limitMs);

          return known;
        }

        const candidates = await this.engines.candidates({
          fen: turn.fen,
          elo: chosen.elo,
          nodes: chosen.nodes,
          variants: variantsFor(chosen, hasStyle(character)),
        });

        const now = candidates[0]?.score ?? null;
        const drift = before === null || now === null ? null : now - before;

        notice({ ...turn, inBook: false, drift }, turn.ply);

        // Поиск съел почти весь ход: бот замечает это вслух — и ходит сразу,
        // без всякой паузы.
        const slow = limitMs !== null && Date.now() - started > limitMs * 0.7;
        if (slow) speak("botLowTime", turn.ply);

        // «Тайм-аут»: думает дольше своего лимита и не скрывает этого. Часы у
        // него всё равно не тикают, так что и терять нечего.
        const stalling =
          magnus && turn.ply >= 8 && Math.random() < ODDS.stall
            ? speak("stalling", turn.ply)
            : false;
        if (stalling) await sleep(STALL_MS);

        const game = new ChessGame(turn.fen);
        const shaped = hasStyle(character)
          ? preferStyle(candidates, traits.style, (uci) => game.shapeOf(uci))
          : candidates;

        const picked = chooseMove(shaped, chosen);
        if (!picked) return null;

        before = picked.score;
        if (!slow) await rest(started, candidates, traits.tempo, limitMs);

        return picked.move;
      },
    };
  }

  /**
   * Записать партию и разнести её по рейтингам.
   *
   * Порядок важен: запись идёт первой, потому что в неё попадают рейтинги «на
   * момент партии» — те, с которыми садились за доску.
   *
   * Ошибка гасится: история и рейтинг важны, но уронить из-за них живую комнату
   * важнее не дать. Незаписанная партия видна в логе.
   */
  private record(draft: MatchDraft, settings: ChessRoomSettings): void {
    const writing = saveMatch({
      ...draft,
      timeControl: settings.timeControl,
    })
      .then(() =>
        applyMatch({
          roomKey: draft.roomKey,
          whiteId: draft.whiteId,
          blackId: draft.blackId,
          result: draft.result,
          reason: draft.reason,
          plies: draft.moves.length,
          botId: draft.botId,
          botLevel: settings.botLevel,
        }),
      )
      .catch((error: unknown) => {
        console.error(`[chess ${draft.roomKey}] партия не записана:`, error);
      });

    this.writing.add(writing);
    void writing.finally(() => this.writing.delete(writing));
  }
}

/** Сколько длится «тайм-аут» Магнуса: заметно дольше любого лимита. */
const STALL_MS = 6000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Подставить в реплику то, что известно только сейчас: фигуру, число ходов. */
function patch(line: string, fill: Record<string, string>): string {
  return Object.entries(fill).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    line,
  );
}

/** Кто сядет за доску на этот раз. Характеры равноправны. */
function someone(): Character {
  return CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)] ?? "pedant";
}

/**
 * Досидеть положенное перед ходом.
 *
 * Пауза считается от начала поиска и включает его: думать долго и потом ещё
 * ждать — значит удвоить задержку (src/games/chess/docs/BACKLOG.md D5).
 */
function rest(
  started: number,
  candidates: readonly Candidate[],
  tempo: number,
  limitMs: number | null,
): Promise<void> {
  const wait = pauseAfter({
    spentMs: Date.now() - started,
    candidates,
    tempo,
    limitMs,
  });

  return wait > 0
    ? new Promise((resolve) => setTimeout(resolve, wait))
    : Promise.resolve();
}

/** Ведущего платформа даёт для чата от имени ботов: им он и нужен. */
export function createChessServer(host: GameHost): GameServer {
  return new ChessServer(host);
}

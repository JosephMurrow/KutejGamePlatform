import type {
  ActionOutcome,
  ChatIntent,
  GameRoomContext,
  GameRoomSnapshot,
  GameRoomState,
  GameViewer,
} from "@/lib/games/engine";
import { parseBet } from "../engine/bet";
import { Room, type GameEvent, type RoomOptions } from "../engine/room";
import { RoomRunner } from "../engine/runner";
import { loadScores, persistRound } from "../engine/store";
import { QuestionQueue } from "../questions/queue";
import {
  getQuestionCard,
  loadQuestionQueue,
  questionCard,
  saveQuestionQueue,
  type QuestionCard,
  type QuestionPoolOptions,
} from "../questions/store";
import { champions, refreshChampions } from "../leaderboard/champions";
import { GAME_EVENT } from "../protocol";
import { parseCommand } from "../twitch";

/** Настройки партии платитутки: пул вопросов и правила. */
export interface PricetituteSettings {
  pool: QuestionPoolOptions;
  rules: RoomOptions;
}

/** Сколько игроков влезает в снимок. */
const PLAYERS_IN_SNAPSHOT = 12;

/** Сколько ставок показывать на вскрышке. */
const BETS_IN_REVEAL = 10;

/** Что комнате нужно от ботов. Их держит серверная часть игры. */
export interface BotAccess {
  count(roomKey: string): number;
  limit: number;
  hasParty(roomKey: string): boolean;
  fill(
    roomKey: string,
    count: number,
    kind: "alone" | "invited",
  ): Promise<number>;
  farewell(roomKey: string): void;
  defaultPartySize: number;
  /** Раунд что-то сделал: режиссёру это нужно знать событием, а не опросом. */
  react(roomKey: string, events: GameEvent[]): void;
}

/**
 * Партия платитутки в одной комнате: машина состояний, её часовой механизм,
 * очередь вопросов и запись итогов.
 *
 * Платформа сюда не смотрит — она зовёт методы `GameRoomState`.
 */
export class PricetituteRoom implements GameRoomState {
  /** Текст текущего вопроса, чтобы не ходить в базу на каждую рассылку. */
  private question: QuestionCard | null = null;

  /** Очередь побочных эффектов: записи в базу не должны обгонять друг друга. */
  private tail: Promise<void> = Promise.resolve();

  private constructor(
    private readonly context: GameRoomContext,
    private readonly settings: PricetituteSettings,
    private readonly bots: BotAccess,
    readonly room: Room,
    readonly runner: RoomRunner,
    private readonly queue: QuestionQueue,
  ) {}

  static async create(
    context: GameRoomContext,
    bots: BotAccess,
  ): Promise<PricetituteRoom> {
    const settings = context.settings as PricetituteSettings;
    const queue = await loadQuestionQueue(context.key, settings.pool);
    const scores = await loadScores(context.key);

    // QuestionQueue структурно подходит под QuestionSource движка.
    const room = new Room(context.key, queue, settings.rules);
    for (const [playerId, stats] of scores) room.setStats(playerId, stats);

    let self: PricetituteRoom | null = null;

    // Раннер не держит ссылку на партию, а зовёт замыкание: иначе объект и
    // раннер ссылались бы друг на друга и один пришлось бы досоздавать.
    const runner = new RoomRunner(room, (events) => {
      self?.enqueue(events);
    });

    self = new PricetituteRoom(context, settings, bots, room, runner, queue);

    return self;
  }

  /** Ключ комнаты: режиссёру ботов он нужен для своих карт. */
  get key(): string {
    return this.context.key;
  }

  /** Режим вопросов: от него зависит, каким набором говорят боты. */
  get mode(): QuestionPoolOptions["mode"] {
    return this.settings.pool.mode;
  }

  /** Сколько живых людей подключено. */
  connections(): number {
    return this.context.connections();
  }

  /** Игра посадила своего игрока — бота. */
  introduce(profile: Parameters<GameRoomContext["introduce"]>[0]): void {
    this.context.introduce(profile);
  }

  /** Игра увела своего игрока. */
  forget(playerId: string): void {
    this.context.forget(playerId);
  }

  join(playerId: string): void {
    this.runner.run((room, now) => room.join(playerId, now));
  }

  leave(playerId: string): void {
    this.runner.run((room, now) => room.leave(playerId, now));
  }

  seated(): readonly string[] {
    return this.room.view().players.map((player) => player.id);
  }

  deadline(): number | null {
    return this.room.view().deadline;
  }

  tick(now: number): void {
    this.runner.tick(now);
  }

  settled(): Promise<void> {
    return this.tail;
  }

  stop(): void {
    this.runner.stop();
  }

  /** Хозяин убирает игрока из партии. Сокет ему рвёт платформа. */
  remove(actorId: string, targetId: string): ActionOutcome {
    return this.runner.run((room, now) => room.kick(actorId, targetId, now));
  }

  act(
    event: string,
    actorId: string,
    payload: unknown,
  ): ActionOutcome | Promise<ActionOutcome> {
    switch (event) {
      case GAME_EVENT.read:
        return this.runner.run((room, now) => room.confirmRead(actorId, now));

      case GAME_EVENT.answer:
      case GAME_EVENT.bet: {
        const bet = parseBet(readBet(payload));
        if (bet === null) {
          return { accepted: false, reason: "Некорректная сумма" };
        }

        return event === GAME_EVENT.answer
          ? this.runner.run((room, now) =>
              room.submitHostAnswer(actorId, bet, now),
            )
          : this.runner.run((room, now) => room.placeBet(actorId, bet, now));
      }

      case GAME_EVENT.closeBetting:
        return this.runner.run((room, now) => room.closeBetting(actorId, now));

      case GAME_EVENT.restart:
        return this.runner.run((room, now) => room.restart(actorId, now));

      case GAME_EVENT.fillBots:
        return this.fillBots(actorId, payload);

      case GAME_EVENT.dismissBots:
        return this.dismissBots(actorId);

      default:
        return { accepted: false, reason: "Неизвестное действие" };
    }
  }

  /**
   * Строчка из чата Твича. Платформа читает чат и знает, кто написал; что
   * значит `!10000` — знает игра.
   */
  fromChat(text: string): ChatIntent | null {
    const command = parseCommand(text);
    if (!command) return null;

    switch (command.kind) {
      case "bet":
        return {
          kind: "act",
          event: GAME_EVENT.bet,
          payload: { bet: command.bet },
        };
      case "join":
        return { kind: "sit" };
      case "leave":
        return { kind: "leave" };
      // Отвечать в чат мост пока не умеет: это отдельный этап с OAuth.
      default:
        return null;
    }
  }

  snapshot(viewer: GameViewer): GameRoomSnapshot {
    const view = this.room.view();
    const isScreen = viewer.kind === "screen";
    const viewerId = isScreen ? "" : viewer.id;

    // В фазе READY вопрос знает только ведущий — и только на своём экране.
    // Экран не знает его никогда: он для того и заведён.
    const questionVisible =
      view.questionVisibleToAll || (!isScreen && view.hostId === viewerId);
    const winners = new Set(view.reveal?.winners ?? []);

    // Вопрос берётся по идентификатору из самого снимка, а не из отложенной
    // загрузки: движок меняет фазу мгновенно, а текст подгружается следующим
    // шагом, и рассылка, попавшая в это окно, уходила бы с пустым вопросом.
    const card =
      questionCard(view.questionId) ??
      (this.question?.id === view.questionId ? this.question : null);

    // Чемпионы берутся из кеша, а обновление уходит в фон: держать рассылку
    // состояния ради похода в базу нельзя.
    refreshChampions();
    const champs = champions();

    const botCount = this.bots.count(this.context.key);
    const isOwner = !isScreen && this.context.ownerId === viewerId;

    return {
      deadline: view.deadline,
      phaseDurationMs: view.phaseDurationMs,
      playerCount: view.players.length,
      players: trimPlayers(view.players, viewerId, view.hostId).map(
        (player) => ({
          id: player.id,
          extra: {
            score: player.score,
            roundsPlayed: player.roundsPlayed,
            hasBet: player.hasBet,
            isHost: player.isHost,
          },
        }),
      ),
      extra: {
        phase: view.phase,
        hostId: view.hostId,
        question: questionVisible ? (card?.text ?? null) : null,
        questionAdult: questionVisible && (card?.adult ?? false),
        reveal: view.reveal
          ? {
              hostAnswer: view.reveal.hostAnswer,
              betCount: view.reveal.bets.length,
              bets: trimBets(view.reveal, viewerId).map((bet) => ({
                playerId: bet.playerId,
                bet: bet.bet,
                distance: view.reveal?.distances[bet.playerId] ?? null,
                won: winners.has(bet.playerId),
              })),
            }
          : null,
        pauseReason: view.pauseReason,
        winners: view.winners,
        roundsPlayed: view.roundsPlayed,
        endMode: view.endMode,
        endValue: view.endValue,
        allTimeChampionId: champs.allTime,
        weekChampionId: champs.week,
        // Кнопка «Forever alone» — только хозяину пустой приватной комнаты.
        canInviteBots:
          isOwner &&
          this.context.isPrivate &&
          this.context.connections() === 1 &&
          botCount === 0,
        canManageBots: isOwner && this.context.isPrivate,
        botCount,
        botLimit: this.bots.limit,
      },
    };
  }

  private async fillBots(
    actorId: string,
    payload: unknown,
  ): Promise<ActionOutcome> {
    if (!this.context.isPrivate) {
      return { accepted: false, reason: "Боты приходят только в свою комнату" };
    }
    if (this.context.ownerId !== actorId) {
      return { accepted: false, reason: "Звать ботов может только хозяин" };
    }

    // Вид компании решает не число людей за столом, а то, как её позвали.
    // Кнопка «Forever alone» шлёт запрос без числа — такие боты уходят сами,
    // когда появляется живой человек. Добор из панели шлёт число: этих хозяин
    // позвал осознанно, и уводить их за него не нужно.
    const asked = readNumber(payload);
    const kind = asked === null ? "alone" : "invited";
    const count = asked ?? this.bots.defaultPartySize;

    if (this.bots.count(this.context.key) >= this.bots.limit) {
      return { accepted: false, reason: "Больше ботов не поместится" };
    }

    const added = await this.bots.fill(this.context.key, count, kind);
    if (added === 0) {
      return { accepted: false, reason: "Не удалось позвать ботов" };
    }

    this.context.changed();
    return { accepted: true };
  }

  private dismissBots(actorId: string): ActionOutcome {
    if (this.context.ownerId !== actorId) {
      return { accepted: false, reason: "Выгонять может только хозяин" };
    }
    if (!this.bots.hasParty(this.context.key)) {
      return { accepted: false, reason: "Ботов и так нет" };
    }

    // Прощаются как обычно: молча исчезнувшая компания выглядит сбоем.
    this.bots.farewell(this.context.key);
    this.context.changed();

    return { accepted: true };
  }

  /**
   * Побочные эффекты одной цепочкой: запись раунда, обновление очереди и
   * рассылка идут строго по порядку, даже если события пришли пачкой.
   */
  private enqueue(events: GameEvent[]): void {
    this.tail = this.tail
      .then(() => this.applyEvents(events))
      .catch((error: unknown) => {
        console.error(
          `[room ${this.context.key}] обработка событий упала:`,
          error,
        );
      })
      .then(() => {
        this.context.emitted(events);
        this.context.changed();
        this.bots.react(this.context.key, events);
      });
  }

  private async applyEvents(events: GameEvent[]): Promise<void> {
    let queueTouched = false;

    for (const event of events) {
      switch (event.type) {
        case "round_started":
          this.question = await getQuestionCard(event.questionId);
          queueTouched = true;
          break;

        case "round_resolved":
          await persistRound(this.context.key, event.record);
          break;

        case "round_aborted":
          this.question = null;
          queueTouched = true;
          break;

        case "paused":
          this.question = null;
          queueTouched = true;
          break;
      }
    }

    if (queueTouched) {
      await saveQuestionQueue(this.context.key, this.queue, this.settings.pool);
    }
  }
}

/**
 * Кого положить в снимок. Ведущий и сам зритель — всегда: без них экран врёт
 * про то, чей ход и поставил ли ты. Остальные места достаются верхушке
 * таблицы, а порядок сохраняется прежний — по кругу ходов.
 */
function trimPlayers<T extends { id: string; score: number }>(
  players: readonly T[],
  viewerId: string,
  hostId: string | null,
): readonly T[] {
  if (players.length <= PLAYERS_IN_SNAPSHOT) return players;

  const keep = new Set<string>();
  if (hostId !== null) keep.add(hostId);
  if (viewerId !== "") keep.add(viewerId);

  for (const player of [...players].sort((a, b) => b.score - a.score)) {
    if (keep.size >= PLAYERS_IN_SNAPSHOT) break;
    keep.add(player.id);
  }

  return players.filter((player) => keep.has(player.id));
}

/**
 * Какие ставки показать на вскрышке: ближайшие к ответу и своя. Промахнувшихся
 * в сто раз не читают, а на большой комнате их сотни.
 */
function trimBets<T extends { playerId: string }>(
  reveal: { bets: readonly T[]; distances: Record<string, number | null> },
  viewerId: string,
): readonly T[] {
  if (reveal.bets.length <= BETS_IN_REVEAL) return reveal.bets;

  const closest = [...reveal.bets].sort((a, b) => {
    const left = reveal.distances[a.playerId];
    const right = reveal.distances[b.playerId];
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;
    return left - right;
  });

  const keep = new Set(
    closest.slice(0, BETS_IN_REVEAL).map((bet) => bet.playerId),
  );
  if (viewerId !== "") keep.add(viewerId);

  return reveal.bets.filter((bet) => keep.has(bet.playerId));
}

/** Ставка из полезной нагрузки: проверять её будет parseBet. */
function readBet(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null) return null;
  return (payload as Record<string, unknown>).bet;
}

/** Число из полезной нагрузки; отсутствие — это null, а не ноль. */
function readNumber(payload: unknown): number | null {
  if (typeof payload !== "object" || payload === null) return null;

  const value = (payload as Record<string, unknown>).count;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  return Math.trunc(value);
}

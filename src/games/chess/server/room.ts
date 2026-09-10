import type {
  ActionOutcome,
  GameRoomContext,
  GameRoomSnapshot,
  GameRoomState,
  GameViewer,
} from "@/lib/games/engine";
import { randomUUID } from "node:crypto";
import { MoveClock, type Ticker } from "../engine/clock";
import type { EndReason, Outcome } from "../engine/outcome";
import { ChessGame, type MoveInput, type MoveRecord } from "../engine/rules";
import { START_RATING } from "../rating/glicko";
import { GAME_EVENT, type ChessColor, type ChessPhase } from "../protocol";
import {
  MOVE_LIMIT_MS,
  VIEWER_DELAY_MS,
  type ChessRoomSettings,
} from "../rooms/settings";
import type { Level } from "../bots/levels";
import type { Moment } from "../bots/moments";

/**
 * Партия в одной комнате: стык правил с платформой.
 *
 * Платформа держит соединения, состав и рассылку; отсюда она получает только
 * дедлайн и снимок, а внутрь не смотрит — слова «шах» она не знает, как не
 * знает и слова «фаза» (docs/BACKLOG.md A3).
 */

/** За доской ровно два места. Остальные смотрят. */
const SEATS = 2;

/**
 * Сколько ждать ушедшего, прежде чем засчитать партию брошенной.
 *
 * Поверх платформенной отсрочки в пятнадцать секунд, которая переживает
 * перезагрузку страницы. Часы хода при этом **не останавливаются**: иначе
 * выдернутый кабель стал бы способом не проиграть
 * (src/games/chess/docs/BACKLOG.md A3).
 */
const ABANDON_MS = 90_000;

/**
 * Потолок партии. Лимит на ход ограничивает ход, но не партию: триста ходов по
 * полминуты — это два с половиной часа, а в безлимитной комнате партия не
 * кончится никогда.
 *
 * Проверяется на ходах, а не будильником: иначе безлимитная комната заводила
 * бы таймер, которого у неё быть не должно.
 */
const MAX_PLIES = 600;
const MAX_GAME_MS = 3 * 60 * 60 * 1000;

/**
 * Доли лимита на ход, на которых бот подаёт голос: сперва замечает, что
 * соперник задумался, потом — что у того горит флаг.
 *
 * Отдельного таймера ради этого не заводим: комната и так говорит платформе,
 * когда её будить, и голос бота — просто ещё одна причина проснуться
 * (src/lib/games/engine.ts, `deadline`).
 */
const NUDGES: { share: number; moment: Moment }[] = [
  { share: 0.5, moment: "playerThinksLong" },
  { share: 0.85, moment: "playerLowTime" },
];

/** Кто ушёл и когда — момент по монотонным часам. */
interface Absence {
  id: string;
  since: number;
}

/**
 * Кадр партии: то, что зритель увидит, когда придёт его время.
 *
 * Хранится остаток на часах, а не срок: срок — момент во времени, и через
 * полминуты он уже прошёл бы. Остаток же переживает задержку и превращается в
 * новый срок ровно тогда, когда зритель ход увидит.
 */
interface Frame {
  /** Когда это случилось, по монотонным часам. */
  at: number;
  view: Record<string, unknown>;
  /** Сколько оставалось на ход; `null` — часы не идут. */
  left: number | null;
}

/**
 * Сколько кадров держим. Тридцать ходов при минутной задержке — с запасом:
 * дальше самые старые не нужны никому.
 */
const FRAMES_KEPT = 64;

/** Партия для записи: всё, что о ней нужно знать базе. */
export interface MatchDraft {
  id: string;
  roomKey: string;
  whiteId: string;
  blackId: string;
  moves: string[];
  times: number[];
  result: "white" | "black" | "draw";
  reason: EndReason;
  startedAt: Date;
  /** Кто из двоих бот, если играли с ним. В базе его нет. */
  botId: string | null;
}

/** Куда комната отдаёт партию. База — снаружи: движок про неё не знает. */
export type Persist = (draft: MatchDraft) => void;

/** Позиция, из которой боту предстоит ходить. */
export interface Turn {
  fen: string;
  /** Хеш позиции: по нему ищется дебютная книга. */
  position: string;
  /** Сколько полуходов уже сделано. */
  ply: number;
  /** Бот играет белыми. */
  white: boolean;
}

/**
 * Чем комната думает за бота. Сам движок живёт снаружи — комната знает только,
 * что кто-то умеет отвечать ходом на позицию.
 */
export type Think = (turn: Turn, level: Level) => Promise<string | null>;

/** Рейтинг игрока, каким его видно за столом. */
export interface Shown {
  rating: number;
  /** Ещё не устоялся: показывается с оговоркой (docs/BACKLOG.md E2). */
  provisional: boolean;
}

/**
 * Где комната берёт рейтинги. База — снаружи: комната знает только, что у
 * игрока где-то есть число, и что приходит оно не сразу.
 */
export type Ratings = (userId: string) => Promise<Shown | null>;

/** Бот за доской: кто он, чем думает и как говорит. */
export interface BotSeat {
  id: string;
  nickname: string;
  avatarId: number;
  level: Level;
  think: Think;
  /**
   * Комната рассказывает боту, что случилось по правилам; сказать ли что-то
   * вслух, решает он сам — у него память на сказанное и своя пауза
   * (src/games/chess/bots/talk.ts).
   */
  speak: (moment: Moment, ply: number) => void;
  /** Реванш: боту забыть сказанное и увиденное за прошлую партию. */
  restart: () => void;
}

export class ChessRoom implements GameRoomState {
  private game = new ChessGame();
  private readonly clock: MoveClock;
  /** Сидящие в порядке посадки: первый играет белыми. */
  private readonly seats: string[] = [];
  private absence: Absence | null = null;
  /** Момент начала партии по монотонным часам. */
  private startedAt: number | null = null;
  /** Он же настенным временем: в базу уезжает именно оно. */
  private startedWall: Date | null = null;
  /** Сколько думали над каждым ходом, мс. */
  private times: number[] = [];
  /** Идентификатор партии: постоянный, чтобы запись обновлялась, а не плодилась. */
  private matchId = randomUUID();

  constructor(
    private readonly context: GameRoomContext,
    private readonly settings: ChessRoomSettings,
    private readonly now: Ticker = () => performance.now(),
    /** Запись партии в базу. Без неё комната работает — просто без истории. */
    private readonly persist?: Persist,
    /** Бот, если играют с ним. Садится сразу и ждёт хода человека. */
    private readonly bot?: BotSeat,
    /** Откуда брать рейтинги игроков. Без неё за столом стартовые числа. */
    private readonly ratings?: Ratings,
  ) {
    this.clock = new MoveClock(MOVE_LIMIT_MS[settings.timeControl], now);
    this.moveStartedAt = now();

    if (this.bot) {
      // Бот — такой же игрок платформы: она запоминает, как его звать, и
      // дописывает ник с аватаром в снимок сама (docs/BACKLOG.md A3).
      this.context.introduce({
        id: this.bot.id,
        nickname: this.bot.nickname,
        avatarId: this.bot.avatarId,
        isGuest: false,
      });
    }
  }

  /** Начало текущего хода по монотонным часам: из него считается время хода. */
  private moveStartedAt: number;
  /** Бот сейчас думает: второй ход начинать нельзя. */
  private thinking = false;
  /** Сколько раз бот уже подал голос на этом ходу соперника. */
  private nudged = 0;
  /** Рейтинги сидящих: приезжают из базы после посадки. */
  private readonly shown = new Map<string, Shown>();
  /** Что зрители ещё не видели: очередь кадров под задержку. */
  private readonly frames: Frame[] = [];

  join(playerId: string): void {
    // Вернулся тот, кого ждали: место за ним и держали.
    if (this.absence?.id === playerId) {
      this.absence = null;
      this.bot?.speak("playerReturned", this.game.ply());
    }

    if (!this.seats.includes(playerId) && this.seats.length < SEATS) {
      this.seats.push(playerId);
      void this.learn(playerId);
      // Бот садится напротив первого пришедшего: ждать ему некого.
      if (this.bot && this.seats.length === 1) this.seats.push(this.bot.id);
      // Мест два; третий и дальше остаются зрителями — за столом их нет, но
      // партию они видят целиком.
      if (this.seats.length === SEATS) {
        this.begin();
        this.bot?.speak("greeting", 0);
      }
    }

    this.context.changed();
  }

  /**
   * Игрок ушёл: закрыл вкладки и не вернулся за платформенную отсрочку.
   *
   * Место за ним остаётся — иначе на него сядет зритель и партия окажется
   * втроём. Освободится оно вместе с концом партии.
   */
  leave(playerId: string): void {
    if (!this.seats.includes(playerId)) return;
    if (this.game.isOver()) return;

    this.absence = { id: playerId, since: this.now() };
    this.bot?.speak("playerLeft", this.game.ply());
    this.context.changed();
  }

  seated(): readonly string[] {
    return this.seats;
  }

  /** Партия кончилась: зал по этому убирает доску. */
  isOver(): boolean {
    return this.game.isOver();
  }

  /**
   * Когда комнату надо разбудить.
   *
   * Не только по часам: бот подаёт голос над задумавшимся соперником, зрителю
   * приходит время увидеть очередной кадр. Всё это поводы проснуться, но не
   * поводы что-то показывать человеку, — для показа есть `showing`.
   *
   * `null` означает «будить незачем», и платформа тогда не заводит таймер
   * вовсе. Так работает безлимитная комната: не особая ветка кода, а просто
   * `null` (src/games/chess/docs/BACKLOG.md A2).
   */
  deadline(): number | null {
    if (this.game.isOver()) return null;

    const waits: number[] = [];

    const shown = this.showing();
    if (shown !== null) waits.push(shown);

    const nudge = this.nudgeIn(this.clock.left());
    if (nudge !== null) waits.push(nudge);

    const reveal = this.revealIn();
    if (reveal !== null) waits.push(reveal);

    if (waits.length === 0) return null;

    // Наружу дедлайн уходит настенным временем: по нему клиент рисует отсчёт.
    // Считается он от монотонного остатка, а не наоборот — настенные часы
    // прыгают при синхронизации, и партия проигралась бы по флагу на ровном
    // месте.
    return Date.now() + Math.min(...waits);
  }

  /**
   * Сколько осталось человеку — по часам хода или по ожиданию ушедшего.
   *
   * Именно это уходит в снимок. Внутренние поводы проснуться сюда не попадают:
   * иначе в безлимитной комнате у игрока откуда-то возникал бы отсчёт, а в
   * партии с ботом полоска дёргалась бы на каждой реплике.
   */
  private showing(): number | null {
    const waits: number[] = [];

    const left = this.clock.left();
    if (left !== null) waits.push(left);

    if (this.absence) {
      waits.push(Math.max(0, ABANDON_MS - (this.now() - this.absence.since)));
    }

    return waits.length === 0 ? null : Math.min(...waits);
  }

  /** Время вышло. Что именно вышло — разбираем здесь. */
  tick(): void {
    if (this.game.isOver()) return;

    if (this.absence && this.now() - this.absence.since >= ABANDON_MS) {
      const gone = this.colorOf(this.absence.id);
      if (gone) this.finish(this.game.abandon(gone === "white" ? "w" : "b"));
      return;
    }

    if (this.clock.expired()) {
      this.finish(this.game.flag(this.game.turn()));
      return;
    }

    // Ни флаг, ни отсрочка не вышли — значит, разбудили ради бота или ради
    // зрителя, которому пора показать следующий кадр.
    //
    // `changed` тут обязателен, даже когда сказать было нечего: будильник
    // платформа заводит только на него, и молчаливый тик оставил бы комнату
    // вовсе без часов (src/server/rooms.ts, `changed`).
    this.nudge();
    this.context.changed();
  }

  act(event: string, actorId: string, payload: unknown): ActionOutcome {
    if (event === GAME_EVENT.resign) return this.resign(actorId);
    if (event === GAME_EVENT.move) return this.makeMove(actorId, payload);
    if (event === GAME_EVENT.claimDraw) return this.claimDraw(actorId);
    if (event === GAME_EVENT.rematch) return this.rematch(actorId);

    return { accepted: false, reason: "Неизвестное действие" };
  }

  remove(actorId: string, targetId: string): ActionOutcome {
    if (this.context.ownerId !== actorId) {
      return { accepted: false, reason: "Выгоняет только хозяин" };
    }

    const color = this.colorOf(targetId);
    if (!color) return { accepted: true };

    // Выгнать из-за доски — то же, что уйти и не вернуться: партия достаётся
    // сопернику, а не растворяется.
    this.finish(this.game.abandon(color === "white" ? "w" : "b"));

    return { accepted: true };
  }

  /**
   * Снимок партии.
   *
   * Игроки и экран видят всё мгновенно. Зритель на сайте — с задержкой, если
   * хозяин комнаты её задал: иначе он опережает эфир и может подсказать
   * сопернику в чате трансляции (src/games/chess/docs/BACKLOG.md F2). Экран не
   * задерживаем: он и есть источник эфира, задержать его значит задержать
   * дважды.
   */
  snapshot(viewer: GameViewer): GameRoomSnapshot {
    const seen = this.delayed(viewer);

    const showing = this.showing();

    return {
      deadline: seen
        ? seen.left === null
          ? null
          : Date.now() + seen.left
        : showing === null || this.game.isOver()
          ? null
          : Date.now() + showing,
      phaseDurationMs: MOVE_LIMIT_MS[this.settings.timeControl],
      playerCount: this.seats.length,
      players: this.seats.map((id, at) => ({
        id,
        extra: {
          color: at === 0 ? "white" : "black",
          rating: this.shown.get(id)?.rating ?? START_RATING,
          /** Рейтинг ещё не устоялся: рисуется с вопросительным знаком. */
          provisional: this.shown.get(id)?.provisional ?? true,
          /** Ушёл, и его ждут: соперник должен это видеть. */
          away: this.absence?.id === id,
        },
      })),
      extra: seen ? seen.view : this.view(),
    };
  }

  /** Игровая часть снимка, как она есть прямо сейчас. */
  private view(): Record<string, unknown> {
    const outcome = this.game.outcome();
    const phase: ChessPhase = outcome
      ? "over"
      : this.seats.length < SEATS
        ? "waiting"
        : "playing";

    return {
      phase,
      fen: phase === "waiting" ? null : this.game.fen(),
      turn: outcome ? null : this.turnColor(),
      moves: this.game.history(),
      lastMove: this.game.lastMove(),
      /** Есть ли основание требовать ничью прямо сейчас. */
      claimable: this.game.claimableDraw(),
      result: outcome?.result ?? null,
      reason: outcome?.reason ?? null,
      timeControl: this.settings.timeControl,
      streamerMode: this.settings.streamerMode,
      viewerDelay: this.settings.viewerDelay,
    };
  }

  settled(): Promise<void> {
    return Promise.resolve();
  }

  stop(): void {
    this.clock.stop();
  }

  /**
   * Снять кадр: с этого момента до зрителей он поедет с задержкой.
   *
   * Зовётся после каждой перемены на доске. Без задержки не копим вовсе —
   * очередь пустая, и снимок собирается как раньше.
   */
  private remember(): void {
    if (VIEWER_DELAY_MS[this.settings.viewerDelay] === 0) return;

    const view = this.view();
    // Ход, которым партия кончилась, приходит сюда дважды — от самого хода и
    // от разбора конца. Кадр при этом один и тот же, и второй такой съел бы
    // место в очереди.
    if (same(this.frames.at(-1)?.view, view)) return;

    this.frames.push({ at: this.now(), view, left: this.clock.left() });
    if (this.frames.length > FRAMES_KEPT) this.frames.shift();
  }

  /**
   * Что видит этот зритель; `null` — то же, что и все.
   *
   * Пока ни один кадр не «созрел», показывается самый первый: начальная
   * расстановка ничего не выдаёт, а пустая доска выглядела бы поломкой.
   */
  private delayed(viewer: GameViewer): Frame | null {
    const delay = VIEWER_DELAY_MS[this.settings.viewerDelay];
    if (delay === 0 || this.frames.length === 0) return null;
    // За доской и на экране задержки нет: первым она мешала бы играть, второй
    // и есть источник эфира.
    if (viewer.kind === "screen" || this.seats.includes(viewer.id)) return null;

    const until = this.now() - delay;

    return (
      this.frames.findLast((frame) => frame.at <= until) ?? this.frames[0]!
    );
  }

  /** Через сколько зрителю пора показать следующий кадр; `null` — нечего. */
  private revealIn(): number | null {
    const delay = VIEWER_DELAY_MS[this.settings.viewerDelay];
    if (delay === 0) return null;

    const until = this.now() - delay;
    const next = this.frames.find((frame) => frame.at > until);

    return next ? Math.max(0, next.at + delay - this.now()) : null;
  }

  /** За стол сели двое — партия пошла, часы пущены. */
  private begin(): void {
    this.startedAt = this.now();
    this.startedWall = new Date();
    this.clock.restart();
    this.frames.length = 0;
    this.remember();
  }

  /** Партия для записи; `null` — записывать ещё нечего. */
  private draft(): MatchDraft | null {
    const [white, black] = this.seats;
    const outcome = this.game.outcome();
    if (!white || !black || !outcome || !this.startedWall) return null;

    return {
      id: this.matchId,
      roomKey: this.context.key,
      whiteId: white,
      blackId: black,
      moves: this.game.history(),
      times: this.times,
      result: outcome.result,
      reason: outcome.reason,
      startedAt: this.startedWall,
      botId: this.bot?.id ?? null,
    };
  }

  private makeMove(actorId: string, payload: unknown): ActionOutcome {
    const color = this.colorOf(actorId);
    if (!color) return { accepted: false, reason: "Ты не за доской" };
    if (this.game.isOver()) {
      return { accepted: false, reason: "Партия кончилась" };
    }
    if (this.seats.length < SEATS) {
      return { accepted: false, reason: "Соперник ещё не сел" };
    }
    if (color !== this.turnColor()) {
      return { accepted: false, reason: "Сейчас не твой ход" };
    }

    const input = parseMove(payload);
    if (!input) return { accepted: false, reason: "Непонятный ход" };

    const spentAt = this.now();
    const result = this.game.move(input.move, input.ply);
    if (!result.ok) {
      return { accepted: false, reason: REJECTION_TEXT[result.reason] };
    }

    // Сколько думали над этим ходом. Считается по монотонным часам, как и всё
    // остальное время партии.
    this.times.push(Math.round(spentAt - this.moveStartedAt));
    this.moveStartedAt = spentAt;
    this.nudged = 0;
    this.clock.restart();
    this.finish(result.outcome ?? this.capIfTooLong());
    this.remember();
    this.tell(result.move, false);
    void this.botTurn();
    // Без этого дедлайн сдвинулся бы, а будильник звонил бы по старому
    // времени. Предупреждение висит прямо в engine.ts, и платитутка на этих
    // граблях уже стояла.
    this.context.changed();

    return { accepted: true };
  }

  private resign(actorId: string): ActionOutcome {
    const color = this.colorOf(actorId);
    if (!color) return { accepted: false, reason: "Ты не за доской" };
    if (this.game.isOver()) {
      return { accepted: false, reason: "Партия кончилась" };
    }

    this.finish(this.game.resign(color === "white" ? "w" : "b"));

    return { accepted: true };
  }

  /**
   * Ещё партия в той же комнате.
   *
   * Цвета меняются местами: играть подряд одним цветом нечестно, а менять их —
   * то, чего от реванша и ждут (src/games/chess/docs/BACKLOG.md G).
   */
  private rematch(actorId: string): ActionOutcome {
    if (!this.colorOf(actorId)) {
      return { accepted: false, reason: "Ты не за доской" };
    }
    if (!this.game.isOver()) {
      return { accepted: false, reason: "Партия ещё идёт" };
    }

    this.seats.reverse();
    this.game = new ChessGame();
    this.times = [];
    this.matchId = randomUUID();
    this.begin();
    this.bot?.restart();
    this.bot?.speak("rematch", 0);
    this.context.changed();
    // Цвета поменялись: если бот теперь белый, ходить ему.
    void this.botTurn();

    return { accepted: true };
  }

  /**
   * Игрок требует ничью по повторению или пятидесяти ходам.
   *
   * Требовать может любой из двоих, а не только тот, чья очередь хода: так это
   * работает на площадках (src/games/chess/docs/SPEC.md).
   */
  private claimDraw(actorId: string): ActionOutcome {
    if (!this.colorOf(actorId)) {
      return { accepted: false, reason: "Ты не за доской" };
    }

    const outcome = this.game.claimDraw();
    if (!outcome) {
      return { accepted: false, reason: "Требовать ничью пока не на чем" };
    }

    this.finish(outcome);
    return { accepted: true };
  }

  /**
   * Ход бота.
   *
   * Думает он снаружи и не мгновенно, поэтому ход применяется, когда придёт, —
   * а не блокирует комнату. Пока думает, второй ход не начинается: иначе бот
   * успеет сходить дважды за один свой ход.
   */
  private async botTurn(): Promise<void> {
    const bot = this.bot;
    if (!bot || this.thinking || this.game.isOver()) return;
    if (this.colorOf(bot.id) !== this.turnColor()) return;

    this.thinking = true;
    try {
      const answer = await bot.think(
        {
          fen: this.game.fen(),
          position: this.game.position(),
          ply: this.game.ply(),
          white: this.colorOf(bot.id) === "white",
        },
        bot.level,
      );
      if (!answer || this.game.isOver()) return;

      const move = {
        from: answer.slice(0, 2),
        to: answer.slice(2, 4),
        promotion: answer.slice(4, 5) as "q" | "r" | "b" | "n" | "",
      };
      const result = this.game.move(
        move.promotion
          ? { from: move.from, to: move.to, promotion: move.promotion }
          : { from: move.from, to: move.to },
        this.game.ply(),
      );
      if (!result.ok) return;

      const spentAt = this.now();
      this.times.push(Math.round(spentAt - this.moveStartedAt));
      this.moveStartedAt = spentAt;
      this.nudged = 0;
      this.clock.restart();
      this.finish(result.outcome ?? this.capIfTooLong());
      this.remember();
      this.tell(result.move, true);
      this.context.changed();
    } finally {
      this.thinking = false;
    }
  }

  /**
   * Узнать рейтинг севшего.
   *
   * Асинхронно и без ожидания: партия начинается сразу, а число приезжает
   * следом и приходит очередным снимком. Бот в базе не значится — его и не
   * спрашиваем.
   */
  private async learn(playerId: string): Promise<void> {
    if (!this.ratings || playerId === this.bot?.id) return;

    const shown = await this.ratings(playerId);
    if (!shown) return;

    this.shown.set(playerId, shown);
    this.context.changed();
  }

  /**
   * Через сколько бот подаст голос на этом ходу; `null` — не подаст.
   *
   * Только на ходу человека и только там, где есть лимит: в безлимитной
   * комнате «ты долго думаешь» — не наблюдение, а придирка.
   */
  private nudgeIn(left: number | null): number | null {
    const limit = MOVE_LIMIT_MS[this.settings.timeControl];
    const bot = this.bot;
    if (!bot || limit === null || left === null) return null;
    if (this.seats.length < SEATS) return null;
    if (this.colorOf(bot.id) === this.turnColor()) return null;

    const next = NUDGES[this.nudged];
    if (!next) return null;

    return Math.max(0, left - limit * (1 - next.share));
  }

  /** Подошёл срок — бот замечает вслух, что соперник тянет. */
  private nudge(): void {
    const due = this.nudgeIn(this.clock.left());
    if (due === null || due > 0) return;

    const next = NUDGES[this.nudged];
    this.nudged += 1;
    if (next) this.bot?.speak(next.moment, this.game.ply());
  }

  /**
   * Рассказать боту про сделанный ход — свой или чужой.
   *
   * Про ход, которым партия кончилась, не рассказываем: на него у бота есть
   * реплика поважнее, и две подряд звучали бы как заедание.
   */
  private tell(move: MoveRecord, mine: boolean): void {
    const bot = this.bot;
    if (!bot || this.game.isOver()) return;

    const moment = mine ? momentOfMine(move) : momentOfTheirs(move);
    if (moment) bot.speak(moment, move.ply);
  }

  /** Партия упёрлась в потолок — по числу ходов или по времени. */
  private capIfTooLong(): Outcome | null {
    const long =
      this.game.ply() >= MAX_PLIES ||
      (this.startedAt !== null && this.now() - this.startedAt >= MAX_GAME_MS);

    return long ? this.game.capOut() : null;
  }

  /**
   * Партия кончилась: погасить часы, записать её и рассказать платформе.
   *
   * Запись именно здесь, а не по таймеру: конец партии — единственный момент,
   * когда история обязана оказаться в базе (src/games/chess/docs/PLAN.md,
   * этап 5).
   */
  private finish(outcome: Outcome | null): void {
    if (!outcome) return;

    this.clock.stop();
    this.absence = null;

    const draft = this.draft();
    // Партия без единого хода не сохраняется: её как будто и не было
    // (src/games/chess/docs/BACKLOG.md G).
    if (draft && draft.moves.length > 0) this.persist?.(draft);

    this.remember();
    this.speakEnd(outcome);
    this.context.emitted([{ type: "chess_finished", ...outcome }]);
    this.context.changed();
  }

  /**
   * Бот про конец партии.
   *
   * Про брошенную и отменённую молчим: слушать некому, а бросать реплику в
   * пустую комнату — то же, что говорить со стенкой.
   */
  private speakEnd(outcome: Outcome): void {
    const bot = this.bot;
    const mine = bot && this.colorOf(bot.id);
    if (!bot || !mine) return;

    const won = outcome.result === mine;
    const moment = endMoment(outcome.reason, won);
    if (moment) bot.speak(moment, this.game.ply());
  }

  private turnColor(): ChessColor {
    return this.game.turn() === "w" ? "white" : "black";
  }

  private colorOf(playerId: string): ChessColor | null {
    const at = this.seats.indexOf(playerId);
    if (at < 0) return null;

    return at === 0 ? "white" : "black";
  }
}

/**
 * Тот же ли это кадр. Сравниваются поля, которые только и меняются на доске:
 * стадия, число сделанных ходов и итог.
 */
function same(
  was: Record<string, unknown> | undefined,
  now: Record<string, unknown>,
): boolean {
  if (!was) return false;

  return (
    was.phase === now.phase &&
    (was.moves as string[]).length === (now.moves as string[]).length &&
    was.result === now.result &&
    was.reason === now.reason
  );
}

/** Что бот видит в собственном ходе. Порядок — от самого громкого. */
function momentOfMine(move: MoveRecord): Moment | null {
  if (move.captured === "q") return "botTakesQueen";
  if (move.promotion) return "botPromotes";
  if (move.san.startsWith("O-O")) return "botCastles";
  if (move.check) return "botChecks";
  if (move.captured) return "botCapture";

  return null;
}

/** Что бот видит в ходе соперника. */
function momentOfTheirs(move: MoveRecord): Moment | null {
  if (move.captured === "q") return "botLosesQueen";
  if (move.captured) return "botLosesPiece";
  if (move.check) return "botInCheck";

  return null;
}

/** Чем кончилась партия — глазами бота. */
function endMoment(reason: EndReason, won: boolean): Moment | null {
  switch (reason) {
    case "checkmate":
      return won ? "botWins" : "botLoses";
    case "stalemate":
      return "stalemate";
    case "resign":
      return won ? "playerResigned" : "botResigned";
    case "flag":
      return won ? "playerFlagged" : "botFlagged";
    case "insufficient":
    case "flagVsInsufficient":
    case "threefold":
    case "fivefold":
    case "fiftyMoves":
    case "seventyFiveMoves":
    case "agreement":
    case "tooLong":
      return "draw";
    // Ушёл и не вернулся или разошлись до первого хода: говорить некому.
    case "abandoned":
    case "aborted":
      return null;
  }
}

/** Почему ход не принят — человеческим текстом. */
const REJECTION_TEXT: Record<string, string> = {
  gameOver: "Партия кончилась",
  notYourTurn: "Сейчас не твой ход",
  stalePly: "Этот ход уже сделан",
  needsPromotion: "Выбери, во что превратить пешку",
  illegal: "Так не ходят",
};

/** Разобрать присланное клиентом. Верить ему нельзя ни в одном поле. */
function parseMove(payload: unknown): { move: MoveInput; ply: number } | null {
  if (typeof payload !== "object" || payload === null) return null;

  const { from, to, promotion, ply } = payload as Record<string, unknown>;

  if (typeof from !== "string" || typeof to !== "string") return null;
  if (typeof ply !== "number" || !Number.isInteger(ply) || ply < 0) return null;

  const move: MoveInput = { from, to };
  if (
    promotion === "q" ||
    promotion === "r" ||
    promotion === "b" ||
    promotion === "n"
  ) {
    move.promotion = promotion;
  }

  return { move, ply };
}

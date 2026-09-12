import { randomInt, randomUUID } from "node:crypto";
import type {
  ActionOutcome,
  GameRoomContext,
  GameRoomSnapshot,
  GameRoomState,
  GameViewer,
} from "@/lib/games/engine";
import { MoveClock, type Ticker } from "../engine/clock";
import { parseSquare, squareName } from "../engine/geometry";
import { TurboGame, type MoveInput, type MoveRejection } from "../engine/game";
import type { EndReason, Outcome } from "../engine/outcome";
import type { PieceKind, Side } from "../engine/pieces";
import type { Position } from "../engine/position";
import { hideAgents } from "../modes/agents";
import type { TurboMode } from "../modes/catalog";
import { bombReady } from "../modes/nuclear";
import { startPosition } from "../modes/rules";
import {
  SHOWDOWN_SETUP_MS,
  showdownNote,
  showdownPosition,
  showdownStart,
  showdownSwap,
  showdownZone,
} from "../modes/showdown";
import { GAME_EVENT, type TurboPhase } from "../protocol";
import {
  MOVE_LIMIT_MS,
  type ModeOptions,
  type TimeControl,
  type TurboRoomSettings,
} from "../rooms/settings";

/**
 * Партия в одной комнате: стык правил с платформой.
 *
 * Платформа держит соединения, состав и рассылку; отсюда она получает только
 * дедлайн и снимок, а внутрь не смотрит. Устроено по образцу шахматной
 * комнаты (src/games/chess/server/room.ts) — копией, а не импортом: игра не
 * импортирует игру. Ботов, задержки для зрителей и общего зала здесь нет:
 * бот придёт на этапе 11, а зала у турбо-шахмат нет вовсе.
 */

/**
 * Сколько ждать ушедшего, прежде чем засчитать партию брошенной.
 *
 * Поверх платформенной отсрочки в пятнадцать секунд, которая переживает
 * перезагрузку страницы. Часы хода при этом **не останавливаются**: иначе
 * выдернутый кабель стал бы способом не проиграть.
 */
const ABANDON_MS = 90_000;

/**
 * Потолок партии. Лимит на ход ограничивает ход, но не партию: в безлимитной
 * комнате партия не кончилась бы никогда. Проверяется на ходах, а не
 * будильником: иначе безлимитная комната заводила бы таймер, которого у неё
 * быть не должно.
 */
const MAX_PLIES = 600;
const MAX_GAME_MS = 3 * 60 * 60 * 1000;

/**
 * Через сколько полуходов можно предложить ничью снова. Без этого «ничья?» на
 * каждый ход становится способом троллинга.
 */
const DRAW_COOLDOWN_PLIES = 10;

/** Кто ушёл и когда — момент по монотонным часам. */
interface Absence {
  id: string;
  since: number;
}

/** Партия для записи: всё, что о ней нужно знать базе. */
export interface MatchDraft {
  id: string;
  roomKey: string;
  mode: TurboMode;
  options: ModeOptions;
  seed: number;
  timeControl: TimeControl;
  /** Кто где сидел: место — это индекс. */
  seats: string[];
  moves: string[];
  times: number[];
  /** Место победителя; `null` — ничья. */
  winner: Side | null;
  reason: EndReason;
  startedAt: Date;
}

/** Куда комната отдаёт партию. База — снаружи: комната про неё не знает. */
export type Persist = (draft: MatchDraft) => void;

/**
 * Зерно случайности партии. Правила пока без костей, но запись партии несёт
 * его с первой же партии: форму записи на живой базе менять дорого
 * (docs/BACKLOG.md C3).
 */
function newSeed(): number {
  return randomInt(0, 2 ** 31);
}

export class TurboRoom implements GameRoomState {
  private game: TurboGame;
  private readonly clock: MoveClock;
  /** Сидящие в порядке посадки: место за столом — это индекс и сторона. */
  private readonly seats: string[] = [];
  private absence: Absence | null = null;
  /** Момент начала партии по монотонным часам; `null` — ещё не началась. */
  private startedAt: number | null = null;
  /** Он же настенным временем: в базу уезжает именно оно. */
  private startedWall: Date | null = null;
  /** Начало текущего хода по монотонным часам: из него считается время хода. */
  private moveStartedAt: number;
  /** Сколько думали над каждым ходом, мс. */
  private times: number[] = [];
  /** Постоянный на всю партию: запись обновляется, а не плодится. */
  private matchId = randomUUID();
  private seed = newSeed();
  /** Кто предложил ничью и ждёт ответа. */
  private offer: Side | null = null;
  /** На каком полуходе каждая сторона предлагала в последний раз. */
  private offered: number[] = [];
  /**
   * Идёт расстановка вслепую — момент её конца по монотонным часам; `null` —
   * расстановки нет (docs/MODES.md, режим 16).
   */
  private setupUntil: number | null = null;
  /** Расстановки сторон, каждая в порядке зоны режима. */
  private arrangement: PieceKind[][] = [];
  /** Кто уже нажал «готов». */
  private setupReady: boolean[] = [];

  constructor(
    private readonly context: GameRoomContext,
    private readonly settings: TurboRoomSettings,
    private readonly now: Ticker = () => performance.now(),
    /** Запись партии в базу. Без неё комната работает — просто без истории. */
    private readonly persist?: Persist,
  ) {
    // Режим встаёт в партию через начальную позицию: движок про режимы не знает.
    this.game = this.newGame();
    this.clock = new MoveClock(MOVE_LIMIT_MS[settings.timeControl], now);
    this.moveStartedAt = now();
    this.resetOffers();
  }

  /** Мест столько, сколько сторон в позиции: двое, в королевской битве — четверо. */
  private get capacity(): number {
    return this.game.position().sides.length;
  }

  join(playerId: string): void {
    // Вернулся тот, кого ждали: место за ним и держали.
    if (this.absence?.id === playerId) this.absence = null;

    if (!this.seats.includes(playerId) && this.seats.length < this.capacity) {
      this.seats.push(playerId);
      // Лишние остаются зрителями: за столом их нет, но партию видят целиком.
      if (this.seats.length === this.capacity) this.start();
    }

    this.context.changed();
  }

  /**
   * Игрок ушёл: закрыл вкладки и не вернулся за платформенную отсрочку.
   *
   * Посреди партии место за ним держится — иначе на него сядет зритель, — и
   * через полторы минуты партия достаётся сопернику. До партии и после неё
   * держать место незачем: оно освобождается сразу.
   */
  leave(playerId: string): void {
    const at = this.seats.indexOf(playerId);
    if (at < 0) return;

    if (this.playing()) {
      this.absence = { id: playerId, since: this.now() };
    } else {
      this.seats.splice(at, 1);
    }
    this.context.changed();
  }

  seated(): readonly string[] {
    return this.seats;
  }

  /**
   * Когда комнату будить: по часам хода или по ожиданию ушедшего. `null` —
   * незачем, и платформа таймер не заводит вовсе: так работает безлимитная
   * комната.
   *
   * Наружу дедлайн уходит настенным временем, а считается от монотонного
   * остатка: настенные часы прыгают при синхронизации.
   */
  deadline(): number | null {
    const showing = this.showing();
    return showing === null ? null : Date.now() + showing;
  }

  /** Сколько осталось — по расстановке, часам хода или ожиданию ушедшего. */
  private showing(): number | null {
    if (!this.playing()) return null;

    const waits: number[] = [];
    if (this.setupUntil !== null) {
      waits.push(Math.max(0, this.setupUntil - this.now()));
    } else {
      const left = this.clock.left();
      if (left !== null) waits.push(left);
    }
    if (this.absence) {
      waits.push(Math.max(0, ABANDON_MS - (this.now() - this.absence.since)));
    }

    return waits.length === 0 ? null : Math.min(...waits);
  }

  /** Время вышло. Что именно вышло — разбираем здесь. */
  tick(): void {
    if (!this.playing()) return;

    if (this.absence && this.now() - this.absence.since >= ABANDON_MS) {
      const gone = this.sideOf(this.absence.id);
      if (gone !== null) this.finish(this.game.abandon(gone));
      return;
    }

    // Время расстановки вышло — вскрываемся с тем, что стоит на доске.
    if (this.setupUntil !== null) {
      if (this.now() >= this.setupUntil) this.reveal();
      else this.context.changed();
      return;
    }

    if (this.clock.expired()) {
      this.finish(this.game.flag(this.game.turn()));
      return;
    }

    // Разбудили раньше срока. `changed` обязателен и тут: будильник платформа
    // заводит только на него, и молчаливый тик оставил бы комнату без часов.
    this.context.changed();
  }

  act(event: string, actorId: string, payload: unknown): ActionOutcome {
    switch (event) {
      case GAME_EVENT.move:
        return this.makeMove(actorId, payload);
      case GAME_EVENT.resign:
        return this.resign(actorId);
      case GAME_EVENT.offerDraw:
        return this.offerDraw(actorId);
      case GAME_EVENT.declineDraw:
        return this.declineDraw(actorId);
      case GAME_EVENT.claimDraw:
        return this.claimDraw(actorId);
      case GAME_EVENT.rematch:
        return this.rematch(actorId);
      case GAME_EVENT.bomb:
        return this.dropBomb(actorId);
      case GAME_EVENT.swap:
        return this.swap(actorId, payload);
      case GAME_EVENT.ready:
        return this.readyUp(actorId);
      default:
        return { accepted: false, reason: "Неизвестное действие" };
    }
  }

  /**
   * Хозяин убирает игрока. Посреди партии это то же, что уйти и не вернуться:
   * партия достаётся сопернику, а не растворяется. Вне партии — просто
   * освобождается место.
   */
  remove(actorId: string, targetId: string): ActionOutcome {
    if (this.context.ownerId !== actorId) {
      return { accepted: false, reason: "Выгоняет только хозяин" };
    }

    const side = this.sideOf(targetId);
    if (side === null) return { accepted: true };

    if (this.playing()) {
      this.finish(this.game.abandon(side));
    } else {
      this.seats.splice(side, 1);
      this.context.changed();
    }
    return { accepted: true };
  }

  snapshot(viewer: GameViewer): GameRoomSnapshot {
    const showing = this.showing();
    // Своя половина расстановки видна только своему месту.
    const seat = viewer.kind === "player" ? this.sideOf(viewer.id) : null;

    return {
      deadline: showing === null ? null : Date.now() + showing,
      // Во время расстановки отсчёт идёт по её девяноста секундам, а не по
      // лимиту на ход: полоса времени должна показывать то, что идёт.
      phaseDurationMs:
        this.setupUntil === null
          ? MOVE_LIMIT_MS[this.settings.timeControl]
          : SHOWDOWN_SETUP_MS,
      playerCount: this.seats.length,
      players: this.seats.map((id, seat) => ({
        id,
        extra: { seat, away: this.absence?.id === id },
      })),
      extra: {
        ...this.view(seat),
        // Предложение ничьей до ответа — секрет сидящих. Зритель узнает о нём
        // только по итогу партии.
        drawOffer: this.seatedViewer(viewer) ? this.offer : null,
      },
    };
  }

  settled(): Promise<void> {
    return Promise.resolve();
  }

  stop(): void {
    this.clock.stop();
  }

  /** Игровая часть снимка — такая, какой её видит это место. */
  private view(seat: Side | null): Record<string, unknown> {
    const outcome = this.game.outcome();
    const setup = this.setupUntil !== null;
    const phase: TurboPhase = outcome
      ? "over"
      : setup
        ? "setup"
        : this.startedAt === null
          ? "waiting"
          : "playing";

    return {
      phase,
      mode: this.settings.mode,
      options: this.settings.options,
      seats: this.capacity,
      // Свой двойной агент — секрет от хозяина, поэтому снимок собирается для
      // каждого места свой (docs/MODES.md, режим 10).
      position: setup
        ? this.setupBoard(seat)
        : hideAgents(this.game.position(), seat),
      covered: setup ? this.coveredZones(seat) : [],
      setupReady: setup ? [...this.setupReady] : [],
      moves: this.game.history(),
      lastMove: this.game.lastMove(),
      turn: phase === "playing" ? this.game.turn() : null,
      claimable: phase === "playing" ? this.game.claimableDraw() : null,
      result: outcome?.result ?? null,
      reason: outcome?.reason ?? null,
      timeControl: this.settings.timeControl,
    };
  }

  /**
   * Доска, какой её видит этот зритель во время расстановки: своя половина на
   * месте, чужая пуста и закрыта рубашкой. Зрителю и экрану пусты обе —
   * трансляцию смотрит и соперник.
   */
  private setupBoard(seat: Side | null): Position {
    return showdownPosition(
      this.arrangement.map((own, side) => (side === seat ? own : null)),
    );
  }

  /** Клетки, закрытые рубашкой: чужие зоны расстановки. */
  private coveredZones(seat: Side | null): string[] {
    const { geometry } = this.game.position();

    return this.arrangement.flatMap((_, side) =>
      side === seat
        ? []
        : showdownZone(side, geometry).map((square) =>
            squareName(geometry, square),
          ),
    );
  }

  /** Партия идёт: началась и не кончилась. */
  private playing(): boolean {
    return this.startedAt !== null && !this.game.isOver();
  }

  private seatedViewer(viewer: GameViewer): boolean {
    return viewer.kind === "player" && this.seats.includes(viewer.id);
  }

  private sideOf(playerId: string): Side | null {
    const at = this.seats.indexOf(playerId);
    return at < 0 ? null : at;
  }

  private resetOffers(): void {
    this.offer = null;
    this.offered = Array.from(
      { length: this.capacity },
      () => -DRAW_COOLDOWN_PLIES,
    );
  }

  /**
   * Стол заполнился — партия пошла. Если за ним уже сыграли, для нового
   * соперника начинается новая партия: старая записана и кончилась.
   */
  private start(): void {
    if (this.game.isOver()) this.fresh();

    this.startedAt = this.now();
    this.startedWall = new Date();
    this.moveStartedAt = this.startedAt;

    // «Вскрываемся» начинается не с хода, а с расстановки вслепую: часы хода
    // пойдут после вскрытия.
    if (this.settings.mode === "SHOWDOWN") {
      this.setupUntil = this.startedAt + SHOWDOWN_SETUP_MS;
      this.arrangement = Array.from({ length: this.capacity }, () =>
        showdownStart(),
      );
      this.setupReady = Array.from({ length: this.capacity }, () => false);
      return;
    }

    this.clock.restart();
  }

  /**
   * Вскрытие: обе расстановки открываются разом, и дальше идёт обычная партия.
   * Зовётся по готовности обоих или по истечении времени — что раньше.
   */
  private reveal(): void {
    if (this.setupUntil === null) return;

    this.setupUntil = null;
    this.game = new TurboGame(showdownPosition(this.arrangement));
    this.moveStartedAt = this.now();
    this.clock.restart();
    this.context.changed();
  }

  private newGame(): TurboGame {
    // Зерно уходит в правила: по нему выбираются двойные агенты, и по нему же
    // партия воспроизводится из записи.
    return new TurboGame(
      startPosition(this.settings.mode, this.settings.options, this.seed),
    );
  }

  /** Чистая партия: новая доска, новая запись, новое зерно. */
  private fresh(): void {
    // Зерно меняется раньше доски: по нему она и собирается.
    this.matchId = randomUUID();
    this.seed = newSeed();
    this.game = this.newGame();
    this.setupUntil = null;
    this.arrangement = [];
    this.setupReady = [];
    this.times = [];
    this.absence = null;
    this.resetOffers();
  }

  private makeMove(actorId: string, payload: unknown): ActionOutcome {
    const side = this.sideOf(actorId);
    if (side === null) return { accepted: false, reason: "Ты не за доской" };
    if (this.game.isOver()) {
      return { accepted: false, reason: "Партия кончилась" };
    }
    if (!this.playing()) {
      return { accepted: false, reason: "Соперник ещё не сел" };
    }
    if (this.setupUntil !== null) {
      return { accepted: false, reason: "Ещё расставляемся" };
    }
    if (side !== this.game.turn()) {
      return { accepted: false, reason: "Сейчас не твой ход" };
    }

    const input = parseMove(payload);
    if (!input) return { accepted: false, reason: "Непонятный ход" };

    const spentAt = this.now();
    const result = this.game.move(input.move, input.ply);
    if (!result.ok) {
      return { accepted: false, reason: REJECTION_TEXT[result.reason] };
    }

    this.times.push(Math.round(spentAt - this.moveStartedAt));
    this.moveStartedAt = spentAt;
    // Предложение живёт до ответа или до следующего хода — что раньше.
    this.offer = null;
    this.clock.restart();
    this.finish(result.outcome ?? this.capIfTooLong());
    // Без этого дедлайн сдвинулся бы, а будильник звонил бы по старому времени.
    this.context.changed();

    return { accepted: true };
  }

  private resign(actorId: string): ActionOutcome {
    const side = this.sideOf(actorId);
    if (side === null) return { accepted: false, reason: "Ты не за доской" };
    if (!this.playing()) return { accepted: false, reason: "Партия не идёт" };

    this.finish(this.game.resign(side));
    return { accepted: true };
  }

  /**
   * Поменять две свои фигуры местами, пока идёт расстановка. Клетки проверяет
   * комната: обе должны быть из своей зоны, а король остаётся на первой
   * горизонтали — так решено в постановке.
   */
  private swap(actorId: string, payload: unknown): ActionOutcome {
    const side = this.sideOf(actorId);
    if (side === null) return { accepted: false, reason: "Ты не за доской" };
    if (this.setupUntil === null) {
      return { accepted: false, reason: "Расстановка кончилась" };
    }
    if (this.setupReady[side]) {
      return { accepted: false, reason: "Ты уже сказал «готов»" };
    }

    const squares = parseSwap(payload);
    if (!squares) return { accepted: false, reason: "Непонятная клетка" };

    const { geometry } = this.game.position();
    const zone = showdownZone(side, geometry);
    const swapped = showdownSwap(
      this.arrangement[side] ?? [],
      zone.indexOf(parseSquare(geometry, squares.from) ?? -1),
      zone.indexOf(parseSquare(geometry, squares.to) ?? -1),
      geometry,
    );
    if (!swapped) return { accepted: false, reason: "Так не переставить" };

    this.arrangement[side] = swapped;
    this.context.changed();
    return { accepted: true };
  }

  /** «Готов». Готовы оба — вскрываемся, не дожидаясь конца времени. */
  private readyUp(actorId: string): ActionOutcome {
    const side = this.sideOf(actorId);
    if (side === null) return { accepted: false, reason: "Ты не за доской" };
    if (this.setupUntil === null) {
      return { accepted: false, reason: "Расстановка кончилась" };
    }

    this.setupReady[side] = true;
    if (this.setupReady.every((ready) => ready)) this.reveal();
    else this.context.changed();

    return { accepted: true };
  }

  /**
   * Сбросить бомбу — «Ядерные». Это действие вместо хода, поэтому и проверки
   * у него ходовые: партия идёт, ты за доской, очередь твоя.
   *
   * Набран ли заряд, решает комната, а не фасад: порог лежит в настройках,
   * которых движок не знает вовсе. Клиенту верить нельзя и здесь — кнопку он
   * рисует себе сам, а считается всё заново.
   */
  private dropBomb(actorId: string): ActionOutcome {
    const side = this.sideOf(actorId);
    if (side === null) return { accepted: false, reason: "Ты не за доской" };
    if (!this.playing()) return { accepted: false, reason: "Партия не идёт" };
    if (this.settings.mode !== "NUCLEAR") {
      return { accepted: false, reason: "В этом режиме бомбы нет" };
    }
    if (side !== this.game.turn()) {
      return { accepted: false, reason: "Сейчас не твой ход" };
    }
    if (!bombReady(this.game.position(), this.settings.options, side)) {
      return { accepted: false, reason: "Заряд ещё не набран" };
    }

    this.finish(this.game.dropBomb(side));
    return { accepted: true };
  }

  /**
   * Предложить ничью — или принять чужое предложение. Одно действие на оба
   * случая: у человека кнопка одна.
   */
  private offerDraw(actorId: string): ActionOutcome {
    const side = this.sideOf(actorId);
    if (side === null) return { accepted: false, reason: "Ты не за доской" };
    if (!this.playing()) return { accepted: false, reason: "Партия не идёт" };

    if (this.offer !== null && this.offer !== side) {
      this.offer = null;
      this.finish(this.game.agreeDraw());
      return { accepted: true };
    }

    const ply = this.game.ply();
    if (
      ply - (this.offered[side] ?? -DRAW_COOLDOWN_PLIES) <
      DRAW_COOLDOWN_PLIES
    ) {
      return { accepted: false, reason: "Ничью только что предлагали" };
    }

    this.offered[side] = ply;
    this.offer = side;
    this.context.changed();
    return { accepted: true };
  }

  private declineDraw(actorId: string): ActionOutcome {
    const side = this.sideOf(actorId);
    if (side === null) return { accepted: false, reason: "Ты не за доской" };
    if (this.offer === null || this.offer === side) {
      return { accepted: false, reason: "Ничью никто не предлагал" };
    }

    this.offer = null;
    this.context.changed();
    return { accepted: true };
  }

  /** Требовать ничью может любой из сидящих, а не только тот, чья очередь. */
  private claimDraw(actorId: string): ActionOutcome {
    if (this.sideOf(actorId) === null) {
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
   * Ещё партия в той же комнате. Места меняются: играть подряд одним цветом
   * нечестно, а смены и ждут от реванша.
   */
  private rematch(actorId: string): ActionOutcome {
    if (this.sideOf(actorId) === null) {
      return { accepted: false, reason: "Ты не за доской" };
    }
    if (!this.game.isOver()) {
      return { accepted: false, reason: "Партия ещё идёт" };
    }
    if (this.seats.length < this.capacity) {
      return { accepted: false, reason: "Соперник ушёл" };
    }

    this.seats.reverse();
    this.start();
    this.context.changed();
    return { accepted: true };
  }

  /** Партия упёрлась в потолок — по числу ходов или по времени. */
  private capIfTooLong(): Outcome | null {
    const long =
      this.game.ply() >= MAX_PLIES ||
      (this.startedAt !== null && this.now() - this.startedAt >= MAX_GAME_MS);

    return long ? this.game.capOut() : null;
  }

  /** Партия для записи; `null` — записывать нечего. */
  private draft(): MatchDraft | null {
    const outcome = this.game.outcome();
    if (!outcome || !this.startedWall) return null;
    if (this.seats.length < this.capacity) return null;

    return {
      id: this.matchId,
      roomKey: this.context.key,
      mode: this.settings.mode,
      // Расстановка «Вскрываемся» уезжает в запись вместе с ручками: без неё
      // партию не перемотать, а отдельного поля под неё в базе нет.
      options:
        this.settings.mode === "SHOWDOWN"
          ? { ...this.settings.options, setup: showdownNote(this.arrangement) }
          : this.settings.options,
      seed: this.seed,
      timeControl: this.settings.timeControl,
      seats: [...this.seats],
      moves: this.game.history(),
      times: [...this.times],
      winner: outcome.result === "draw" ? null : outcome.result,
      reason: outcome.reason,
      startedAt: this.startedWall,
    };
  }

  /**
   * Партия кончилась: погасить часы, записать её и рассказать платформе. Запись
   * именно здесь: конец партии — единственный момент, когда история обязана
   * оказаться в базе.
   */
  private finish(outcome: Outcome | null): void {
    if (!outcome) return;

    this.clock.stop();
    this.absence = null;

    // Партия без единого хода не сохраняется: её как будто и не было.
    const draft = this.draft();
    if (draft && draft.moves.length > 0) this.persist?.(draft);

    this.context.emitted([{ type: "turbochess_finished", ...outcome }]);
    this.context.changed();
  }
}

/** Почему ход не принят — человеческим текстом. */
const REJECTION_TEXT: Record<MoveRejection, string> = {
  gameOver: "Партия кончилась",
  notYourTurn: "Сейчас не твой ход",
  stalePly: "Этот ход уже сделан",
  needsPromotion: "Выбери, во что превратить пешку",
  illegal: "Так не ходят",
};

/** Разобрать перестановку: две клетки своей зоны. */
function parseSwap(payload: unknown): { from: string; to: string } | null {
  if (typeof payload !== "object" || payload === null) return null;

  const { from, to } = payload as Record<string, unknown>;
  if (typeof from !== "string" || typeof to !== "string") return null;

  return { from, to };
}

/** Разобрать присланное клиентом. Верить ему нельзя ни в одном поле. */
function parseMove(payload: unknown): { move: MoveInput; ply: number } | null {
  if (typeof payload !== "object" || payload === null) return null;

  const { from, to, promotion, drop, ply } = payload as Record<string, unknown>;

  if (typeof to !== "string") return null;
  if (typeof ply !== "number" || !Number.isInteger(ply) || ply < 0) return null;

  // Выставление из резерва приходит вместо клетки «откуда»: фигура ниоткуда.
  if (
    drop === "q" ||
    drop === "r" ||
    drop === "b" ||
    drop === "n" ||
    drop === "p"
  ) {
    return { move: { drop, to }, ply };
  }
  if (typeof from !== "string") return null;

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

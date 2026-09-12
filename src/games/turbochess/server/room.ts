import { randomInt, randomUUID } from "node:crypto";
import type {
  ActionOutcome,
  GameRoomContext,
  GameRoomSnapshot,
  GameRoomState,
  GameViewer,
} from "@/lib/games/engine";
import type { BotRecord, BotSeat } from "../bots/seat";
import {
  bombCall,
  chanceCall,
  MARKET_COOLDOWN,
  marketCall,
  setupCall,
  setupWait,
  toastCall,
  vetoCall,
} from "../bots/buttons";
import { evaluate } from "../bots/evaluate";
import type { Moment } from "../bots/moments";
import { moodOf } from "../bots/mood";
import { think } from "../bots/mind";
import { pauseMs } from "../bots/tempo";
import { MoveClock, type Ticker } from "../engine/clock";
import { parseSquare, squareName } from "../engine/geometry";
import {
  TurboGame,
  type MarketItem,
  type MarketOrder,
  type MoveInput,
  type MoveRecord,
  type MoveRejection,
} from "../engine/game";
import { inCheck, legalMoves, play } from "../engine/moves";
import type { EndReason, Outcome } from "../engine/outcome";
import type { PieceKind, Side } from "../engine/pieces";
import { alive, type Position } from "../engine/position";
import { hideAgents } from "../modes/agents";
import { TOAST_MS } from "../modes/booze";
import { marketPrice, pointsLeft } from "../modes/market";
import { roller } from "../modes/random";
import type { TurboMode } from "../modes/catalog";
import { chanceReady } from "../modes/lastChance";
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
 * импортирует игру. Задержки для зрителей и общего зала здесь нет: зала у
 * турбо-шахмат нет вовсе.
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
  /** Кто из сидевших был программой: у бота учётной записи нет. */
  bots: BotRecord[];
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
  /**
   * «Алко»: висит окно после взятия. Часы хода на это время стоят — пить и
   * думать одновременно нечестно (docs/MODES.md, режим 5).
   */
  private toast: { drinker: Side; pourer: Side; until: number } | null = null;
  /** Сколько выпито каждым. */
  private drinks: number[] = [];
  /** «Анархия»: отменённые ходы — их показывают перечёркнутыми. */
  private vetoed: { ply: number; san: string }[] = [];
  /** Боты за столом по их номеру игрока. Пустая — за столом одни живые. */
  private readonly bots = new Map<string, BotSeat>();
  /**
   * Когда бот доиграет свою паузу и сходит, по монотонным часам; `null` — ждать
   * некого.
   *
   * Ход бота не таймер, а тот же дедлайн, которым живёт комната: платформа
   * будит её по `deadline()`, и ход случается в `tick()`. Иначе в комнате
   * появился бы второй источник времени, невидимый тестам и не переживающий
   * выключение процесса.
   */
  private botAt: number | null = null;
  /** На каком полуходе назначена эта пауза. */
  private botPly = -1;
  /**
   * Оценка позиции глазами бота сразу после его хода.
   *
   * По ней он потом видит, во сколько обошёлся ход соперника, — а по этому
   * считается вероятность «НЕТ» в анархии: чем хуже чужой ход, тем вероятнее
   * отмена (docs/BOTS.md, режим 15).
   */
  private botEdge: (number | null)[] = [];
  /** С какого своего хода у бота заряжена бомба: по этому считается терпение. */
  private botArmed: (number | null)[] = [];
  /** На каком полуходе бот последний раз подходил к прилавку. */
  private botBought: number[] = [];
  /**
   * Оценка позиции, какой бот видел её в прошлый раз — на любом ходу, не только
   * своём. По разнице считается настроение: резкая перемена важнее самой
   * позиции (docs/BOTS.md, «Голос и колоды»).
   */
  private botSeen: (number | null)[] = [];
  /** Кто ещё в игре: в битве по этому видно, что соседа вынесли. */
  private botStanding: boolean[] = [];

  constructor(
    private readonly context: GameRoomContext,
    private readonly settings: TurboRoomSettings,
    private readonly now: Ticker = () => performance.now(),
    /** Запись партии в базу. Без неё комната работает — просто без истории. */
    private readonly persist?: Persist,
    /**
     * Кого сажать, если позовут: готовые боты с разными характерами. Комната их
     * не выдумывает — кого именно, решает серверная часть по настройкам
     * комнаты (docs/BOTS.md, А6).
     */
    private readonly pool: readonly BotSeat[] = [],
  ) {
    // Режим встаёт в партию через начальную позицию: движок про режимы не знает.
    this.game = this.newGame();
    this.clock = new MoveClock(MOVE_LIMIT_MS[settings.timeControl], now);
    this.moveStartedAt = now();
    this.resetOffers();
  }

  /**
   * Посадить бота: он такой же игрок платформы, только без учётной записи.
   *
   * Платформа запоминает, как его звать и каким лицом рисовать, и дальше
   * дописывает его в снимок сама — комнате отдельного кода на показ бота не
   * нужно.
   */
  private seatBot(bot: BotSeat): boolean {
    if (this.seats.length >= this.capacity || this.seats.includes(bot.id)) {
      return false;
    }

    this.context.introduce({
      id: bot.id,
      nickname: bot.nickname,
      avatarId: bot.avatarId,
      isGuest: false,
    });
    this.bots.set(bot.id, bot);
    this.seats.push(bot.id);

    // Партию отсюда не начинаем: место за столом занимают по одному, а начать
    // её надо один раз — это делает тот, кто сажал (`join` или «позвать бота»).
    return true;
  }

  /**
   * Снимок поменялся: сказать платформе и завести боту паузу.
   *
   * Пауза заводится здесь, а не по первому вопросу о ней, потому что считаться
   * она должна с той минуты, когда ход перешёл к боту, — а не с той, когда
   * платформа впервые спросила дедлайн. Разница видна на тике, пришедшем без
   * вопроса: раньше он уходил впустую, и бот ходил только со второго.
   */
  private changed(): void {
    this.botWait();
    this.context.changed();
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
      // Боты добирают стол после человека, а не до него: сядь они первыми,
      // человеку всегда доставалось бы последнее место, а первый ход — машине.
      this.fillWithBots(this.settings.bots);
      // Лишние остаются зрителями: за столом их нет, но партию видят целиком.
      if (this.seats.length === this.capacity) this.start();
    }

    this.changed();
  }

  /** Досадить ботов из запаса — столько, сколько просили, и не больше мест. */
  private fillWithBots(count: number): number {
    let seated = 0;

    for (const bot of this.pool) {
      if (seated >= count || this.seats.length >= this.capacity) break;
      if (this.seatBot(bot)) seated++;
    }

    return seated;
  }

  /**
   * «Позвать бота»: посадить программу на свободное место руками.
   *
   * Иначе королевскую битву на четверых не набрать — троих живых надо ещё
   * найти, — а ждать друга с автоподсадкой по таймеру обидно (docs/BOTS.md, А6).
   */
  private callBot(actorId: string): ActionOutcome {
    if (!this.seats.includes(actorId) && this.context.ownerId !== actorId) {
      return { accepted: false, reason: "Звать может тот, кто за столом" };
    }
    if (this.seats.length >= this.capacity) {
      return { accepted: false, reason: "Свободных мест нет" };
    }
    if (this.playing()) {
      return { accepted: false, reason: "Партия уже идёт" };
    }
    if (this.fillWithBots(1) === 0) {
      return { accepted: false, reason: "Больше программ нет" };
    }
    if (this.seats.length === this.capacity) this.start();

    this.changed();
    return { accepted: true };
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
    this.changed();
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
    if (this.toast) {
      waits.push(Math.max(0, this.toast.until - this.now()));
    } else if (this.setupUntil !== null) {
      waits.push(Math.max(0, this.setupUntil - this.now()));
    } else {
      const left = this.clock.left();
      if (left !== null) waits.push(left);
    }
    if (this.absence) {
      waits.push(Math.max(0, ABANDON_MS - (this.now() - this.absence.since)));
    }
    // Ход бота — такой же срок, как часы: комната будится по нему и ходит в
    // `tick`, а не по своему таймеру.
    const bot = this.botWait();
    if (bot !== null) waits.push(bot);

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

    // Молчание за окном — «не подтвердил»: штраф обоим.
    if (this.toast) {
      if (this.now() >= this.toast.until) {
        this.finish(this.game.punish(this.rolls(this.capacity, 1)));
        this.closeToast();
      } else if (this.botWait() === 0) {
        this.doBot();
      } else {
        this.changed();
      }
      return;
    }

    // Время расстановки вышло — вскрываемся с тем, что стоит на доске.
    if (this.setupUntil !== null) {
      if (this.now() >= this.setupUntil) this.reveal();
      else if (this.botWait() === 0) this.doBot();
      else this.changed();
      return;
    }

    if (this.clock.expired()) {
      this.finish(this.game.flag(this.game.turn()));
      return;
    }

    // Бот додумал — ходит или жмёт кнопку. Всё идёт обычной дверью.
    if (this.botWait() === 0) {
      this.doBot();
      return;
    }

    // Разбудили раньше срока. `changed` обязателен и тут: будильник платформа
    // заводит только на него, и молчаливый тик оставил бы комнату без часов.
    this.changed();
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
      case GAME_EVENT.bot:
        return this.callBot(actorId);
      case GAME_EVENT.bomb:
        return this.dropBomb(actorId);
      case GAME_EVENT.chance:
        return this.useChance(actorId);
      case GAME_EVENT.veto:
        return this.veto(actorId);
      case GAME_EVENT.toast:
        return this.confirmToast(actorId);
      case GAME_EVENT.buy:
        return this.buy(actorId, payload);
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
      this.changed();
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
      phaseDurationMs: this.toast
        ? TOAST_MS
        : this.setupUntil === null
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
      toast: this.toast
        ? { drinker: this.toast.drinker, pourer: this.toast.pourer }
        : null,
      drinks: [...this.drinks],
      vetoed: [...this.vetoed],
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
  /**
   * Рассказать ботам, что случилось ходом.
   *
   * Комната только называет момент: говорить или молчать, решает сам бот — у
   * него колода без возврата и своя пауза. Тому, кто ходил, и тем, кто смотрел,
   * моменты разные: первый хвастается взятием, вторые переживают потерю.
   */
  private announce(record: MoveRecord, mover: Side): void {
    const ply = this.game.ply();
    const position = this.game.position();

    // Битва: выбывание происходит внутри движка, и заметить его можно только
    // по доске — короля у стороны больше нет.
    if (position.rules.goal === "battle") {
      for (let seat = 0; seat < this.capacity; seat++) {
        const standing = alive(position, seat);
        if (this.botStanding[seat] && !standing) this.knockout(seat);
        this.botStanding[seat] = standing;
      }
    }

    for (let seat = 0; seat < this.capacity; seat++) {
      const id = this.seats[seat];
      const bot = id === undefined ? undefined : this.bots.get(id);
      if (!bot) continue;

      const edge = evaluate(this.game.position(), seat);
      const swing = edge - (this.botSeen[seat] ?? edge);
      this.botSeen[seat] = edge;

      const moment =
        seat === mover
          ? this.moverMoment(record, ply, edge, swing)
          : this.watcherMoment(seat, swing);
      if (moment) bot.speak?.(moment, ply);
    }
  }

  /** О чём говорит тот, кто только что сходил. */
  private moverMoment(
    record: MoveRecord,
    ply: number,
    edge: number,
    swing: number,
  ): Moment {
    if (record.drop) return "drop";
    if (record.san.startsWith("O-O")) return "botCastles";
    if (record.promotion) return "botPromotes";
    if (record.captured === "q") return "botTakesQueen";
    if (record.captured) return "botCapture";
    if (record.check) return "botChecks";

    // Стадия партии важнее настроения: про эндшпиль говорят тогда, когда он
    // начался, а не когда придётся.
    if (ply <= 6) return "opening";
    if (ply >= 80) return "longGame";
    if (this.game.position().board.filter(Boolean).length <= 8)
      return "endgame";

    return moodOf(edge, swing);
  }

  /** О чём говорит тот, при ком сходили. */
  private watcherMoment(seat: Side, swing: number): Moment | null {
    if (swing <= -600) return "botLosesQueen";
    if (swing <= -250) return "botLosesPiece";
    if (inCheck(this.game.position(), seat)) return "botInCheck";
    if (swing >= 250) return "playerBlunder";

    return null;
  }

  /** Сказать одному боту; молча, если на этом месте человек. */
  private tell(seat: Side, moment: Moment): void {
    const id = this.seats[seat];
    const bot = id === undefined ? undefined : this.bots.get(id);
    bot?.speak?.(moment, this.game.ply());
  }

  /** Бот, чья сейчас очередь; `null` — ход человека или партия стоит. */
  private botToMove(): BotSeat | null {
    if (!this.playing() || this.toast || this.setupUntil !== null) return null;

    const at = this.game.turn();
    const id = this.seats[at];
    return id === undefined ? null : (this.bots.get(id) ?? null);
  }

  /**
   * Что бот должен сделать прямо сейчас, кроме хода.
   *
   * Две кнопки живут вне очереди: подтверждение чужой стопки (окно висит у
   * срубившего, чья бы ни была очередь) и расстановка вслепую, которой очереди
   * нет вовсе. Обе идут тем же будильником, что и ход, — иначе в комнате
   * появилось бы три источника времени вместо одного.
   */
  private botDuty(): {
    bot: BotSeat;
    seat: Side;
    kind: "toast" | "setup";
  } | null {
    if (!this.playing()) return null;

    if (this.toast) {
      const seat = this.toast.pourer;
      const bot = this.botAt_(seat);
      return bot ? { bot, seat, kind: "toast" } : null;
    }

    if (this.setupUntil !== null) {
      for (let seat = 0; seat < this.capacity; seat++) {
        if (this.setupReady[seat]) continue;
        const bot = this.botAt_(seat);
        if (bot) return { bot, seat, kind: "setup" };
      }
    }

    return null;
  }

  /** Бот на этом месте; `null` — там человек или место пустое. */
  private botAt_(seat: Side): BotSeat | null {
    const id = this.seats[seat];
    return id === undefined ? null : (this.bots.get(id) ?? null);
  }

  /**
   * Сколько боту осталось «думать»; `null` — ждать некого.
   *
   * Пауза назначается на первый вопрос об этом полуходе и держится до тех пор,
   * пока полуход не сменится: спрашивают об этом и будильник, и тик, и они
   * должны получить один и тот же ответ.
   */
  private botWait(): number | null {
    const duty = this.botDuty();
    const bot = duty ? duty.bot : this.botToMove();
    if (!bot) {
      this.botAt = null;
      return null;
    }

    // Дело вне очереди живёт своим счётом: полуход при стопке и расстановке не
    // меняется, поэтому меткой служит вид дела.
    const mark = duty ? (duty.kind === "toast" ? -2 : -3) : this.game.ply();
    if (this.botAt === null || this.botPly !== mark) {
      this.botPly = mark;
      this.botAt =
        this.now() +
        (duty ? this.dutyPause(duty.kind, bot) : this.botPause(bot));
    }

    return Math.max(0, this.botAt - this.now());
  }

  /** Пауза на дело вне очереди: над стопкой думают иначе, чем над расстановкой. */
  private dutyPause(kind: "toast" | "setup", bot: BotSeat): number {
    const roll = roller(this.seed, this.game.ply() * 8 + 7);

    if (kind === "toast") {
      return toastCall({ traits: bot.traits, windowMs: TOAST_MS, roll }).waitMs;
    }

    return setupWait(roll);
  }

  /** Пауза перед ходом: считается один раз на полуход и по зерну партии. */
  private botPause(bot: BotSeat): number {
    const left = this.clock.left();
    const roll = this.rolls(1, 5)[0] ?? 0.5;
    // Тот же расчёт, что и в голове бота, но без перебора: сколько кандидатов,
    // тут неизвестно, и берётся оценка по числу фигур на доске.
    const width = this.game.position().board.filter(Boolean).length;

    return pauseMs(bot.level, bot.traits, width, () => roll, left);
  }

  /**
   * Ход бота. Идёт через ту же дверь, что и ход человека: `makeMove` проверит
   * очередь, номер полухода и законность — у бота нет никаких поблажек, кроме
   * тех, что записаны в его уровне.
   *
   * Перед ходом бот решает про кнопки режима: они не ходы, и перебор про них
   * ничего не знает. Кнопка, которая кончает партию или заменяет ход, на этом
   * полуходе ход и отменяет.
   */
  /** Что бот делает по будильнику: своё дело вне очереди или свой ход. */
  private doBot(): void {
    const duty = this.botDuty();
    this.botAt = null;

    if (!duty) {
      this.playBot();
      return;
    }

    if (duty.kind === "toast") {
      const roll = roller(this.seed, this.game.ply() * 8 + 7);
      const answer = toastCall({
        traits: duty.bot.traits,
        windowMs: TOAST_MS,
        roll,
      });
      // Соврать здесь — это промолчать: окно закроется само, и штраф придёт
      // обоим. Поэтому «не подтверждаю» — это просто не звать `confirmToast`.
      if (answer.confirm) {
        duty.bot.speak?.("toast", this.game.ply());
        this.confirmToast(duty.bot.id);
      } else this.changed();
      return;
    }

    this.setupBot(duty.bot, duty.seat);
  }

  /**
   * Расстановка вслепую: бот раскладывается по заготовке характера и говорит
   * «готов». Заготовка — это обмены от стандартной расстановки, поэтому она
   * всегда полная, чем бы дело ни кончилось.
   */
  private setupBot(bot: BotSeat, seat: Side): void {
    const { geometry } = this.game.position();
    const zone = showdownZone(seat, geometry);
    // Заготовка написана местами в зоне, а дверь принимает клетки: бот стучится
    // в ту же дверь, что и человек, и переводит сам.
    const square = (at: number) => {
      const found = zone[at];
      return found === undefined ? null : squareName(geometry, found);
    };

    for (const [from, to] of setupCall(bot.character)) {
      const one = square(from);
      const two = square(to);
      if (one && two) this.swap(bot.id, { from: one, to: two });
    }

    bot.speak?.("ready", this.game.ply());
    this.readyUp(bot.id);
  }

  private playBot(): void {
    const bot = this.botToMove();
    if (!bot) return;

    const seat = this.game.turn();
    this.botAt = null;

    if (this.pressButtons(bot, seat)) return;

    const thought = think({
      position: this.game.position(),
      seat,
      level: bot.level,
      traits: bot.traits,
      ply: this.game.ply(),
      drinks: this.drinks[seat] ?? 0,
      roll: roller(this.seed, this.game.ply() * 8 + 9),
      limitMs: this.clock.left(),
    });

    // Думать нечем — значит ходов нет, и это уже не забота бота: партию
    // разберёт движок на ближайшем тике.
    if (!thought) return;

    // Оценка после своего хода запоминается до чужого: по разнице потом видно,
    // во сколько обошёлся ход соперника.
    this.makeMove(bot.id, { ...thought.input, ply: this.game.ply() });
    this.botEdge[seat] = evaluate(this.game.position(), seat);
  }

  /**
   * Кнопки режима в свой ход: бомба, «НЕТ», последний шанс, магазин.
   *
   * `true` — ход на этом полуходе уже не нужен: бомба кончает партию, «НЕТ» и
   * шанс отдают очередь сопернику, дополнительный ход с рынка возвращает её
   * боту, и ходить он будет следующим тиком.
   */
  private pressButtons(bot: BotSeat, seat: Side): boolean {
    const position = this.game.position();
    const roll = roller(this.seed, this.game.ply() * 8 + 6);

    // Ядерные: бомба кончает партию победой, и решать про неё надо до хода.
    if (this.settings.mode === "NUCLEAR") {
      if (bombReady(position, this.settings.options, seat)) {
        const armed = this.botArmed[seat];
        if (armed === null) this.botArmed[seat] = this.game.ply();
        const since = Math.floor(
          (this.game.ply() - (this.botArmed[seat] ?? this.game.ply())) / 2,
        );

        if (
          bombCall({
            edge: evaluate(position, seat),
            since,
            traits: bot.traits,
            roll,
          })
        ) {
          bot.speak?.("bomb", this.game.ply());
          return this.dropBomb(bot.id).accepted;
        }
        // Заряд добрал только что — об этом можно и намекнуть.
        if (armed === null) bot.speak?.("armed", this.game.ply());
      } else {
        this.botArmed[seat] = null;
      }
    }

    // Анархия: отменить чужой ход, пока он не стал историей.
    if (this.settings.mode === "ANARCHY" && this.game.ply() > 0) {
      const was = this.botEdge[seat] ?? null;
      const now = evaluate(position, seat);

      if (
        vetoCall({
          loss: was === null ? 0 : was - now,
          mate: this.mated(seat),
          left: position.vetoes[seat] ?? 0,
          traits: bot.traits,
          roll,
        })
      ) {
        bot.speak?.("veto", this.game.ply());
        // Отменённый ход соперник переиграет другим: бот ждёт его снова.
        return this.veto(bot.id).accepted;
      }
    }

    // Последний шанс: прыжок вместо хода, и он один на партию.
    if (this.settings.mode === "LAST_CHANCE" && chanceReady(position, seat)) {
      if (
        chanceCall({
          mate: this.mated(seat),
          check: inCheck(position, seat),
          cost: this.escapeCost(seat),
          level: bot.level,
          traits: bot.traits,
        })
      ) {
        bot.speak?.("chance", this.game.ply());
        return this.useChance(bot.id).accepted;
      }
    }

    // Чёрный рынок: покупка хода не стоит, кроме дополнительного — он ход и есть.
    if (this.settings.mode === "BLACK_MARKET") {
      const order = marketCall({
        position,
        seat,
        since: Math.floor((this.game.ply() - (this.botBought[seat] ?? 0)) / 2),
        traits: bot.traits,
        roll,
      });

      if (order && this.buy(bot.id, order).accepted) {
        bot.speak?.("buy", this.game.ply());
        this.botBought[seat] = this.game.ply();
        // Дополнительный ход очередь не отдаёт: ходить всё равно боту, и он
        // сделает это следующим тиком — с новой паузой, как человек.
        return true;
      }
    }

    return false;
  }

  /**
   * Мат ли это.
   *
   * В анархии и последнем шансе мат не кончает партию, пока цела кнопка, —
   * значит очередь до бота доходит, и он должен понимать, что происходит:
   * шах, из которого нет ни одного хода, и есть мат.
   */
  private mated(seat: Side): boolean {
    const position = this.game.position();
    if (position.turn !== seat) return false;

    return inCheck(position, seat) && legalMoves(position).length === 0;
  }

  /**
   * Во сколько обходится лучший выход из шаха: по нему сильный уровень решает,
   * жать ли последний шанс до мата.
   */
  private escapeCost(seat: Side): number {
    const position = this.game.position();
    const now = evaluate(position, seat);
    let best = -Infinity;

    for (const move of legalMoves(position)) {
      best = Math.max(best, evaluate(play(position, move), seat));
    }

    return best === -Infinity ? 0 : now - best;
  }

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
    this.drinks = Array.from({ length: this.capacity }, () => 0);
    this.vetoed = [];
    this.toast = null;
    this.forgetBots();
    this.greet();

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

  /** Поздороваться каждому боту за столом: партия началась. */
  private greet(): void {
    for (const bot of this.bots.values()) bot.speak?.("greeting", 0);
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
    for (const bot of this.bots.values()) bot.speak?.("reveal", 0);
    this.changed();
  }

  /** Новая партия — боту забыть, что он видел и когда покупал. */
  private forgetBots(): void {
    this.botEdge = Array.from({ length: this.capacity }, () => null);
    this.botArmed = Array.from({ length: this.capacity }, () => null);
    this.botBought = Array.from(
      { length: this.capacity },
      () => -MARKET_COOLDOWN,
    );
    this.botSeen = Array.from({ length: this.capacity }, () => null);
    this.botStanding = Array.from({ length: this.capacity }, () => true);
    for (const bot of this.bots.values()) bot.restart?.();
    this.botAt = null;
    this.botPly = -1;
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
    if (this.toast) return { accepted: false, reason: "Сначала выпейте" };
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

    // Алко-шахматы: после взятия висит окно, и часы хода на это время стоят.
    if (this.settings.mode === "BOOZE" && result.move.captured) {
      this.toast = {
        drinker: (side + 1) % this.capacity,
        pourer: side,
        until: spentAt + TOAST_MS,
      };
      this.clock.stop();
    } else {
      this.clock.restart();
    }

    this.finish(result.outcome ?? this.capIfTooLong());
    // Ботам рассказываем после того, как партия разобрана: иначе на мате они
    // говорили бы про взятие, а не про мат.
    this.announce(result.move, side);
    // Без этого дедлайн сдвинулся бы, а будильник звонил бы по старому времени.
    this.changed();

    return { accepted: true };
  }

  private resign(actorId: string): ActionOutcome {
    const side = this.sideOf(actorId);
    if (side === null) return { accepted: false, reason: "Ты не за доской" };
    if (!this.playing()) return { accepted: false, reason: "Партия не идёт" };

    this.finish(this.game.resign(side));
    return { accepted: true };
  }

  /** Броски партии: одно зерно, разная соль — и партия воспроизводится. */
  private rolls(count: number, salt: number): number[] {
    const roll = roller(this.seed, this.game.ply() * 8 + salt);
    return Array.from({ length: count }, () => roll());
  }

  /** Окно закрылось: часы хода пошли снова. */
  private closeToast(): void {
    this.toast = null;
    this.moveStartedAt = this.now();
    this.clock.restart();
    this.changed();
  }

  /**
   * «Алко»: срубивший подтверждает, что соперник выпил. Молчание разбирает
   * будильник — там же и штраф.
   */
  private confirmToast(actorId: string): ActionOutcome {
    const side = this.sideOf(actorId);
    if (side === null) return { accepted: false, reason: "Ты не за доской" };
    if (!this.toast) return { accepted: false, reason: "Наливать некому" };
    if (this.toast.pourer !== side) {
      return { accepted: false, reason: "Подтверждает тот, кто срубил" };
    }

    const drinker = this.toast.drinker;
    this.drinks[drinker] = (this.drinks[drinker] ?? 0) + 1;
    // Выпил — сказал. Пьющая программа это главный мем режима.
    this.tell(drinker, "drink");
    this.closeToast();

    return { accepted: true };
  }

  /**
   * «Последний шанс»: король прыгает в случайную клетку. Бросок делает
   * комната по зерну партии — клиент не бросает никогда.
   */
  private useChance(actorId: string): ActionOutcome {
    const side = this.sideOf(actorId);
    if (side === null) return { accepted: false, reason: "Ты не за доской" };
    if (!this.playing()) return { accepted: false, reason: "Партия не идёт" };
    if (this.settings.mode !== "LAST_CHANCE") {
      return { accepted: false, reason: "В этом режиме шансов нет" };
    }
    if (this.toast) return { accepted: false, reason: "Сначала выпейте" };

    const spentAt = this.now();
    const result = this.game.useChance(side, this.rolls(1, 3)[0] ?? 0);
    if (!result.ok) {
      return { accepted: false, reason: REJECTION_TEXT[result.reason] };
    }

    this.times.push(Math.round(spentAt - this.moveStartedAt));
    this.moveStartedAt = spentAt;
    this.offer = null;
    this.clock.restart();
    this.finish(result.outcome ?? this.capIfTooLong());
    this.changed();

    return { accepted: true };
  }

  /**
   * «Чёрный рынок»: купить эффект. Цену считает режим, очки — позиция, а
   * саму покупку применяет фасад. Комната сводит их вместе и никому на слово
   * не верит.
   */
  private buy(actorId: string, payload: unknown): ActionOutcome {
    const side = this.sideOf(actorId);
    if (side === null) return { accepted: false, reason: "Ты не за доской" };
    if (!this.playing()) return { accepted: false, reason: "Партия не идёт" };
    if (this.settings.mode !== "BLACK_MARKET") {
      return { accepted: false, reason: "В этом режиме магазина нет" };
    }
    if (this.toast) return { accepted: false, reason: "Сначала выпейте" };
    if (side !== this.game.turn()) {
      return { accepted: false, reason: "Покупают в свой ход" };
    }

    const order = parseOrder(payload);
    if (!order) return { accepted: false, reason: "Непонятная покупка" };

    const price = marketPrice(order.item, order.kind);
    if (pointsLeft(this.game.position(), side) < price) {
      return { accepted: false, reason: "Не хватает очков" };
    }
    if (!this.game.market(side, order, price)) {
      return { accepted: false, reason: "Так не купить" };
    }

    this.changed();
    return { accepted: true };
  }

  /**
   * «Анархия»: отменить последний ход соперника. Потраченное на него время
   * возвращается — иначе кнопка была бы способом сжечь чужие часы.
   */
  private veto(actorId: string): ActionOutcome {
    const side = this.sideOf(actorId);
    if (side === null) return { accepted: false, reason: "Ты не за доской" };
    if (!this.playing()) return { accepted: false, reason: "Партия не идёт" };
    if (this.settings.mode !== "ANARCHY") {
      return { accepted: false, reason: "В этом режиме «НЕТ» не говорят" };
    }
    if (this.toast) return { accepted: false, reason: "Сначала выпейте" };
    if ((this.game.position().vetoes[side] ?? 0) <= 0) {
      return { accepted: false, reason: "«НЕТ» кончились" };
    }

    const gone = this.game.veto(side);
    if (!gone) return { accepted: false, reason: "Отменять нечего" };

    this.times.pop();
    this.vetoed.push({ ply: gone.ply, san: gone.san });
    this.offer = null;
    this.moveStartedAt = this.now();
    this.clock.restart();
    // Отменяют всегда чужой ход: ворчит тот, чья теперь снова очередь.
    this.tell(this.game.turn(), "vetoed");
    this.changed();

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
    this.changed();
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
    else this.changed();

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
    if (this.capacity > 2) {
      // Вчетвером не соглашаются, а выбывают: ничья тут не с кем.
      return { accepted: false, reason: "Вчетвером ничьих не бывает" };
    }

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
    this.changed();
    return { accepted: true };
  }

  private declineDraw(actorId: string): ActionOutcome {
    const side = this.sideOf(actorId);
    if (side === null) return { accepted: false, reason: "Ты не за доской" };
    if (this.offer === null || this.offer === side) {
      return { accepted: false, reason: "Ничью никто не предлагал" };
    }

    this.offer = null;
    this.changed();
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
    for (const bot of this.bots.values()) bot.speak?.("rematch", 0);
    this.changed();
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
      bots: this.seats.flatMap((id, seat) => {
        const bot = this.bots.get(id);
        return bot
          ? [
              {
                seat,
                character: bot.character,
                level: bot.level.id,
                nickname: bot.nickname,
              },
            ]
          : [];
      }),
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
    this.farewell(outcome);

    // Партия без единого хода не сохраняется: её как будто и не было.
    const draft = this.draft();
    if (draft && draft.moves.length > 0) this.persist?.(draft);

    this.context.emitted([{ type: "turbochess_finished", ...outcome }]);
    this.changed();
  }

  /**
   * Последнее слово каждого бота.
   *
   * Мат и не-мат разведены намеренно: «я поставил мат» после упавшего флага
   * звучит как насмешка над самим собой, а бот у нас персонаж, а не протокол.
   */
  /** Битва: кого-то вынесли — оставшиеся это замечают. */
  private knockout(gone: Side): void {
    for (let seat = 0; seat < this.capacity; seat++) {
      if (seat !== gone) this.tell(seat, "knockout");
    }
  }

  private farewell(outcome: Outcome): void {
    const mate = outcome.reason === "checkmate";

    for (let seat = 0; seat < this.capacity; seat++) {
      if (outcome.result === "draw") {
        this.tell(seat, "draw");
        continue;
      }

      const won = outcome.result === seat;
      this.tell(
        seat,
        won ? (mate ? "botMates" : "botWins") : mate ? "botMated" : "botLoses",
      );
    }
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

/** Разобрать покупку. Верить клиенту нельзя ни в одном поле. */
function parseOrder(payload: unknown): MarketOrder | null {
  if (typeof payload !== "object" || payload === null) return null;

  const { item, from, to, kind } = payload as Record<string, unknown>;
  const items: readonly MarketItem[] = [
    "extra",
    "shield",
    "relocate",
    "swap",
    "revive",
  ];
  if (!items.includes(item as MarketItem)) return null;

  const order: MarketOrder = { item: item as MarketItem };
  if (typeof from === "string") order.from = from;
  if (typeof to === "string") order.to = to;
  if (
    kind === "q" ||
    kind === "r" ||
    kind === "b" ||
    kind === "n" ||
    kind === "p"
  ) {
    order.kind = kind;
  }

  return order;
}

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

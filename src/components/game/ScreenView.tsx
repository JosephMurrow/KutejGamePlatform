"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Brand } from "@/components/Brand";
import { formatBet, isNever } from "@/lib/game/bet";
import { buildQr } from "@/lib/qr";
import type { PlayerPayload, RoomStatePayload } from "@/shared/protocol";
import { Countdown } from "./Countdown";
import { useGameRoom } from "./useGameRoom";

/**
 * Вид «экран»: то, что видит зал — телевизор в комнате или трансляция.
 *
 * Здесь нет ни одного секрета и это его единственный смысл. Вопрос появляется
 * только после того, как открыт всем; чужие ставки — только на вскрышке; полей
 * ввода нет вовсе; чата нет тоже (см. src/games/pricetitute/docs/BACKLOG.md N1 и O4). Всё личное
 * живёт на телефонах игроков.
 *
 * Верстается крупно: это читают с дивана, а не с руки.
 */

/**
 * Сколько новичок остаётся на экране безымянным.
 *
 * Ник гость вписывает сам, а экран идёт в эфир, и отвечает за картинку хозяин
 * канала. Несколько секунд задержки дают ему время выгнать того, кто пришёл с
 * гадостью вместо имени (см. src/games/pricetitute/docs/BACKLOG.md O4).
 */
const NEWCOMER_DELAY_MS = 8000;

/**
 * Кого уже можно звать по имени. Место за столом новичок занимает сразу — он
 * есть и в счёте, и в порядке ходов, — прячется только ник.
 *
 * Учёт идёт в эффекте, а не на рендере: состав меняется по таймеру, а не по
 * приходу снимка, и считать время прямо в разметке нельзя.
 */
function useSettled(players: readonly PlayerPayload[]): ReadonlySet<string> {
  const firstSeen = useRef<Map<string, number>>(new Map());
  const primed = useRef(false);
  const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());

  // Состав строкой: эффект должен просыпаться на приход и уход, а массив
  // менял бы личность на каждом снимке.
  const roster = players.map((player) => player.id).join(",");

  useEffect(() => {
    const ids = roster === "" ? [] : roster.split(",");

    const refresh = () => {
      const seen = firstSeen.current;
      const now = Date.now();

      // Те, кто уже сидел, когда экран включили, безымянными не становятся:
      // задержка нужна против новичков, а не против всей комнаты. Считать
      // экран «включённым» можно только с первого непустого состава: до
      // первого снимка список пуст, и на нём приманка срабатывала вхолостую.
      const start = primed.current ? now : now - NEWCOMER_DELAY_MS;
      if (ids.length > 0) primed.current = true;

      for (const id of ids) if (!seen.has(id)) seen.set(id, start);
      for (const id of [...seen.keys()]) {
        if (!ids.includes(id)) seen.delete(id);
      }

      const next = new Set(
        ids.filter((id) => now - (seen.get(id) ?? now) >= NEWCOMER_DELAY_MS),
      );

      setSettled((previous) => (sameIds(previous, next) ? previous : next));
    };

    refresh();
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, [roster]);

  return settled;
}

function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/** Имя для экрана: у новичка его пока нет. */
function screenName(
  player: PlayerPayload | undefined,
  settled: ReadonlySet<string>,
): string {
  if (!player) return "Игрок";
  return settled.has(player.id) ? player.nickname : "Новый игрок";
}
export function ScreenView({
  roomCode,
  screenKey,
}: {
  roomCode: string;
  screenKey: string;
}) {
  const room = useGameRoom(roomCode, screenKey);
  const state = room.state;
  const settled = useSettled(state?.players ?? []);
  const lobby =
    state === null || state.phase === "waiting" || state.phase === "finished";

  if (room.kicked !== null) {
    return <Curtain title={room.kicked} />;
  }

  if (state === null) {
    return (
      <Curtain
        title={room.connected ? "Заходим в комнату…" : "Связь с сервером"}
        hint={room.error ?? undefined}
      />
    );
  }

  return (
    /*
      Экран живёт ровно в кадре и не прокручивается: в трансляции и на
      телевизоре прокрутки нет вовсе, и всё, что не влезло, просто пропадает.
      Поэтому высота фиксированная, а длинные куски внутри обрезаются сами.
    */
    <div className="flex h-svh flex-col gap-6 overflow-hidden p-6 sm:p-10">
      <header className="flex items-baseline justify-between gap-6">
        <h1 className="min-w-0 truncate text-2xl font-bold sm:text-4xl">
          {state.roomTitle ?? <Brand className="text-2xl sm:text-4xl" />}
        </h1>

        <span className="tabular shrink-0 text-2xl font-bold tracking-[0.2em] text-crimson sm:text-4xl">
          {state.roomCode}
        </span>
      </header>

      {!room.connected && (
        <p className="rounded-2xl border border-line bg-paper px-6 py-3 text-center text-lg text-muted">
          Связь с сервером потеряна, восстанавливаем…
        </p>
      )}

      <div className="grid min-h-0 flex-1 items-stretch gap-6 lg:grid-cols-[1fr_360px]">
        <main className="flex min-h-0 min-w-0 flex-col gap-6 overflow-hidden">
          <Phase
            state={state}
            clockOffset={room.clockOffset}
            settled={settled}
          />
          <Stage state={state} settled={settled} />
          {lobby && <JoinBoard state={state} />}
        </main>

        {/*
          Код прижат к низу колонки, а таблица отдаёт ему место: на вскрышке
          левая половина вырастает, и без этого код уехал бы за кадр.
        */}
        <aside className="flex min-h-0 min-w-0 flex-col gap-6">
          <div className="min-h-0 flex-1 overflow-hidden">
            <Standings state={state} settled={settled} />
          </div>
          {!lobby && <JoinCorner state={state} />}
        </aside>
      </div>
    </div>
  );
}

/**
 * Как попасть в комнату: QR-код и код словами.
 *
 * Висит постоянно и в домашней, и в стримерской. Смысл один и тот же: экран
 * показывают — на телевизоре или в трансляции, — и человек наводит камеру
 * прямо на него. Тот, кто увидел партию с середины, должен иметь возможность
 * зайти, не дожидаясь, пока хозяин объявит код голосом.
 *
 * Никакого «детекта десктопа» здесь нет и не надо: это вид «экран», он про себя
 * знает всё сам. Телефоны игроков открывают другую страницу и кода не видят.
 */

/**
 * Ссылка на комнату. Адрес берём из строки браузера: снаружи и изнутри сети он
 * разный, и правильный тот, по которому сюда пришли.
 */
function joinLink(state: RoomStatePayload): string {
  if (typeof window === "undefined" || state.roomCode === null) return "";
  return `${window.location.origin}/r/${state.roomCode}`;
}

/** Набор идёт: код крупно посреди экрана, смотреть всё равно не на что. */
function JoinBoard({ state }: { state: RoomStatePayload }) {
  const link = joinLink(state);
  if (link === "") return null;

  return (
    <div className="flex items-center justify-center gap-6 rounded-3xl border border-line bg-paper p-6">
      <Qr link={link} size={168} />
      <div>
        <p className="text-xl text-muted sm:text-2xl">Заходи с телефона</p>
        <p className="tabular mt-1 text-4xl font-bold tracking-[0.2em] text-crimson sm:text-5xl">
          {state.roomCode}
        </p>
      </div>
    </div>
  );
}

/**
 * Партия идёт: код уезжает под таблицу и уменьшается.
 *
 * Не `fixed`: плавающий поверх разметки угол накрывал бы хвост таблицы на
 * невысоких экранах. В потоке он остаётся тем же нижним правым углом, но
 * ничего собой не закрывает.
 */
function JoinCorner({ state }: { state: RoomStatePayload }) {
  const link = joinLink(state);
  if (link === "") return null;

  return (
    <div className="flex items-center gap-4 rounded-3xl border border-line bg-paper p-4">
      <Qr link={link} size={92} />
      <div className="min-w-0">
        <p className="text-sm text-muted">Заходи с телефона</p>
        <p className="tabular text-xl font-bold tracking-[0.15em] text-crimson">
          {state.roomCode}
        </p>
      </div>
    </div>
  );
}

/** Код чёрным на белом: читается он контрастом, на цветном фоне капризничает. */
function Qr({ link, size }: { link: string; size: number }) {
  const qr = useMemo(() => buildQr(link), [link]);

  return (
    <div className="rounded-xl bg-white p-2">
      <svg
        viewBox={`0 0 ${qr.size} ${qr.size}`}
        width={size}
        height={size}
        role="img"
        aria-label="QR-код со ссылкой на комнату"
        shapeRendering="crispEdges"
        className="block"
      >
        <path d={qr.path} fill="#000000" />
      </svg>
    </div>
  );
}

/** Заглушка во весь экран: до подключения и после отключения. */
function Curtain({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-10 text-center">
      <Brand className="text-3xl" />
      <p className="text-xl font-semibold">{title}</p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
}

function Phase({
  state,
  clockOffset,
  settled,
}: {
  state: RoomStatePayload;
  clockOffset: number;
  settled: ReadonlySet<string>;
}) {
  const host = state.players.find((player) => player.id === state.hostId);

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-line bg-paper p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-3xl font-bold sm:text-5xl">{title(state)}</h2>

        {host && (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar id={host.avatarId} size={44} />
            <span className="min-w-0 truncate text-lg text-muted sm:text-2xl">
              ведёт {screenName(host, settled)}
            </span>
          </div>
        )}
      </div>

      <Countdown
        deadline={state.deadline}
        durationMs={state.phaseDurationMs}
        clockOffset={clockOffset}
        big
      />
    </div>
  );
}

/** Середина экрана: вопрос, ожидание или вскрышка. */
function Stage({
  state,
  settled,
}: {
  state: RoomStatePayload;
  settled: ReadonlySet<string>;
}) {
  if (state.phase === "reveal" && state.reveal) {
    return <ScreenReveal state={state} settled={settled} />;
  }

  if (state.phase === "finished") {
    return <Winners state={state} settled={settled} />;
  }

  if (state.phase === "waiting") {
    return (
      <Card muted>
        {state.pauseReason === "no_questions"
          ? "Вопросы в пуле кончились"
          : "Ждём игроков — вдвоём уже можно начинать"}
      </Card>
    );
  }

  // Вопрос закрыт: идут фазы ведущего. Именно ради этих двадцати пяти секунд
  // экран и заведён — на нём вопроса нет, ведущий читает его с телефона.
  if (state.question === null) {
    return (
      <Card muted>
        Ведущий читает вопрос про себя
        <span className="mt-3 block text-lg font-normal text-muted">
          Ни вопроса, ни его суммы здесь не будет — он отвечает со своего
          телефона
        </span>
      </Card>
    );
  }

  return (
    <div className="rounded-3xl border border-line bg-paper p-6 sm:p-10">
      {state.questionAdult && (
        <span className="mb-4 inline-block rounded-lg bg-tint px-3 py-1 text-base font-semibold text-crimson">
          18+
        </span>
      )}
      <p className="text-3xl font-medium leading-snug sm:text-5xl">
        {state.question}
      </p>

      {state.phase === "betting" && (
        <p className="mt-6 text-lg text-muted sm:text-2xl">
          Поставили {state.players.filter((player) => player.hasBet).length} из{" "}
          {Math.max(0, state.playerCount - 1)}
        </p>
      )}
    </div>
  );
}

function ScreenReveal({
  state,
  settled,
}: {
  state: RoomStatePayload;
  settled: ReadonlySet<string>;
}) {
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
      <div className="rounded-3xl border-2 border-crimson/30 bg-tint p-6 text-center sm:p-8">
        <p className="text-lg text-muted sm:text-2xl">
          Ведущий согласился бы за
        </p>
        <p
          className={`mt-2 text-4xl font-bold text-crimson sm:text-6xl ${
            isNever(reveal.hostAnswer) ? "" : "tabular"
          }`}
        >
          {formatBet(reveal.hostAnswer)}
        </p>
      </div>

      {reveal.betCount > sorted.length && (
        <p className="text-center text-lg text-muted">
          ближайшие {Math.min(8, sorted.length)} из {reveal.betCount}
        </p>
      )}

      {sorted.length === 0 ? (
        <Card muted>Никто не успел поставить</Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.slice(0, 8).map((bet, index) => {
            const player = players.get(bet.playerId);

            return (
              <li
                key={bet.playerId}
                className={`reveal-row flex items-center gap-4 rounded-2xl border p-3 sm:p-4 ${
                  bet.won ? "border-gold bg-gold/10" : "border-line bg-paper"
                }`}
                style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
              >
                <Avatar id={player?.avatarId ?? 0} size={40} />

                <span className="min-w-0 flex-1 truncate text-xl font-medium sm:text-2xl">
                  {screenName(player, settled)}
                </span>

                <span
                  className={`shrink-0 text-xl font-semibold sm:text-2xl ${
                    isNever(bet.bet) ? "" : "tabular"
                  }`}
                >
                  {formatBet(bet.bet)}
                </span>

                {bet.won && (
                  <span className="shrink-0 rounded-lg bg-gold px-2 py-0.5 text-base font-bold text-paper">
                    +1
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Winners({
  state,
  settled,
}: {
  state: RoomStatePayload;
  settled: ReadonlySet<string>;
}) {
  const names = (state.winners ?? [])
    .map((id) =>
      screenName(
        state.players.find((player) => player.id === id),
        settled,
      ),
    )
    .join(", ");

  return (
    <Card>
      Партия окончена
      <span className="mt-3 block text-2xl font-semibold text-crimson">
        {names === "" ? "Без победителя" : names}
      </span>
    </Card>
  );
}

/** Таблица комнаты. Длинный список на экране никто не читает — берём верхушку. */
function Standings({
  state,
  settled,
}: {
  state: RoomStatePayload;
  settled: ReadonlySet<string>;
}) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const shown = sorted.slice(0, 8);
  // Остальные — это и те, кого не показываем, и те, кого сервер не прислал:
  // на большой комнате в снимок попадает только верхушка таблицы.
  const rest = state.playerCount - shown.length;

  return (
    <div className="rounded-3xl border border-line bg-paper p-5">
      <h2 className="mb-4 flex items-baseline justify-between gap-3 text-lg font-semibold text-muted">
        Таблица
        <span className="tabular text-base">{state.playerCount}</span>
      </h2>

      <ul className="flex flex-col gap-2">
        {shown.map((player, index) => (
          <Row
            key={player.id}
            place={index + 1}
            player={player}
            name={screenName(player, settled)}
            leading={player.id === state.hostId}
          />
        ))}
      </ul>

      {rest > 0 && (
        <p className="mt-3 text-center text-sm text-muted">и ещё {rest}</p>
      )}
    </div>
  );
}

function Row({
  place,
  player,
  name,
  leading,
}: {
  place: number;
  player: PlayerPayload;
  /** Имя для экрана: у новичка его ещё нет. */
  name: string;
  /** Ведущий текущего раунда: подсвечивается, чтобы зал понимал, чей ход. */
  leading: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${
        leading ? "bg-tint" : ""
      }`}
    >
      <span className="tabular w-6 shrink-0 text-right text-sm text-muted">
        {place}
      </span>
      <Avatar id={player.avatarId} size={32} />
      <span className="min-w-0 flex-1 truncate text-lg">{name}</span>
      <span className="tabular shrink-0 text-lg font-bold text-crimson">
        {player.score}
      </span>
    </li>
  );
}

function Card({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border bg-paper p-8 text-center text-2xl font-semibold sm:p-12 sm:text-4xl ${
        muted ? "border-dashed border-line text-muted" : "border-line"
      }`}
    >
      {children}
    </div>
  );
}

function title(state: RoomStatePayload): string {
  switch (state.phase) {
    case "waiting":
      return "Перерыв";
    case "ready":
      return "Раунд начинается";
    case "host_answer":
      return "Ведущий думает";
    case "betting":
      return "Делайте ставки";
    case "reveal":
      return "Вскрываем";
    case "finished":
      return "Партия окончена";
  }
}

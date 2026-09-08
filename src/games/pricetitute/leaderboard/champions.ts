import { loadLeaderboard } from "./board";

/**
 * Чемпионы рейтинга: лучший за всё время и лучший за неделю.
 *
 * Считаются тем же кодом, что рисует таблицу рейтинга, — иначе корона в
 * комнате и первая строка таблицы однажды разошлись бы, и объяснить это
 * человеку было бы нечем.
 *
 * Снимок состояния комнаты собирается синхронно и уходит в сокет по многу раз
 * за раунд, поэтому чемпионы живут в кеше: в базу ходим не чаще раза в минуту,
 * и уж точно не на каждую рассылку.
 */

export interface Champions {
  /** Лучший за всё время. */
  allTime: string | null;
  /** Лучший за текущую неделю. */
  week: string | null;
}

const NOBODY: Champions = { allTime: null, week: null };

/** Как долго снимок считается свежим. */
const TTL_MS = 60_000;

let cached: Champions = NOBODY;
let refreshedAt = 0;
let inFlight: Promise<void> | null = null;

/** Чемпионы из кеша. Может быть чуть устаревшим — это не беда. */
export function champions(): Champions {
  return cached;
}

/**
 * Освежить кеш, если протух. Результата не ждём: корона появится через
 * секунду со следующей рассылкой, а задерживать ради неё раздачу состояния
 * всей комнате незачем.
 */
export function refreshChampions(now: number = Date.now()): void {
  if (inFlight || now - refreshedAt < TTL_MS) return;

  inFlight = load()
    .then((next) => {
      cached = next;
      refreshedAt = Date.now();
    })
    .catch(() => {
      // База моргнула — оставляем прежних чемпионов и пробуем в другой раз.
      refreshedAt = Date.now();
    })
    .finally(() => {
      inFlight = null;
    });
}

/** Сбросить кеш. Нужно тестам и перезапуску. */
export function forgetChampions(): void {
  cached = NOBODY;
  refreshedAt = 0;
}

/**
 * Посчитать чемпионов прямо сейчас, мимо кеша. Нужно страницам, которые
 * рисуются по запросу: там пустой кеш на холодном сервере обернулся бы
 * таблицей без корон.
 */
export async function loadChampions(): Promise<Champions> {
  return load();
}

async function load(): Promise<Champions> {
  // Пустой зритель: своя строка в этом расчёте не нужна, нужна только первая.
  const [all, week] = await Promise.all([
    loadLeaderboard("all", ""),
    loadLeaderboard("week", ""),
  ]);

  return { allTime: leader(all.rows), week: leader(week.rows) };
}

/** Чемпион — только с ненулевым счётом: корона за ноль очков смешна. */
function leader(rows: readonly { userId: string; points: number }[]) {
  const top = rows[0];
  return top && top.points > 0 ? top.userId : null;
}

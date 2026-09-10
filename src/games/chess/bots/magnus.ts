import type { Cheats } from "../server/room";
import type { Moment } from "./moments";
import type { Cheat } from "./lines/magnus";

/**
 * Магнус: скрытый пятый уровень, который жульничает.
 *
 * Играет на 2900 — чуть выше рекорда живого Магнуса Карлсена, ровно настолько,
 * чтобы это читалось как шутка. Остальное — приёмы, и отобраны они по одному
 * признаку: **каждый обязан быть заметен игроку**, иначе это просто сильный бот
 * (src/games/chess/docs/BACKLOG.md D3).
 *
 * Решает и объясняется он сам; комната только спрашивает, будет ли он тут
 * жульничать (`Cheats` в `server/room.ts`).
 */

/** Как бот говорит: возвращает, прозвучало ли. */
export type Say = (
  key: Moment | Cheat,
  ply: number,
  fill?: Record<string, string>,
) => boolean;

/**
 * Как часто он себе это позволяет.
 *
 * Редко намеренно. Приём, который случается каждый ход, перестаёт быть шуткой и
 * становится помехой: партию с ним надо доигрывать, а не бросать на третьем
 * ходу.
 */
export const ODDS = {
  /** Передумать и переиграть свой ход. */
  redo: 0.1,
  /** Откатить чужой — но только когда ход был хорош. */
  takeback: 0.35,
  /** Взять «тайм-аут» и думать дольше положенного. */
  stall: 0.15,
} as const;

/** С какого хода приёмы включаются: в дебюте они не смешны. */
const NOT_BEFORE = 8;

/** Фигуры по-русски: в винительном падеже, как их называют в реплике. */
const PIECES: Record<string, string> = {
  p: "пешку",
  n: "коня",
  b: "слона",
  r: "ладью",
  q: "ферзя",
  k: "короля",
};

/** Собрать приёмы. Случайность приходит параметром — ради тестов. */
export function cheatsOf(say: Say, random: () => number = Math.random): Cheats {
  /** Ход соперника откатывается ровно один раз за партию. */
  let takenBack = false;
  /** О какой фигуре в руке уже говорили: дважды об одной — не смешно. */
  let lastHeld: string | null = null;

  return {
    keepClock(ply) {
      // Единственный приём без случайности: флаг у него не падает никогда.
      say("noFlag", ply);

      return true;
    },

    refuseDraw(ply) {
      say("noDraw", ply);

      return true;
    },

    takeback(ply) {
      if (takenBack || ply < NOT_BEFORE) return false;
      if (random() >= ODDS.takeback) return false;

      takenBack = true;
      say("takeback", ply);

      return true;
    },

    redo(ply) {
      if (ply < NOT_BEFORE || random() >= ODDS.redo) return false;
      say("redo", ply);

      return true;
    },

    holding(piece, ply) {
      const name = PIECES[piece];
      if (!name || name === lastHeld) return;

      // Реплика не должна звучать на каждое касание: человек возит фигуру по
      // доске, и болтовня из приёма превращается в шум.
      if (say("holding", ply, { фигура: name })) lastHeld = name;
    },

    restart() {
      takenBack = false;
      lastHeld = null;
    },
  };
}

/** Позиция из таблиц окончаний: лучший ход и расстояние до мата. */
export interface Perfect {
  /** Ход координатами. */
  move: string;
  /** Ходов до мата; `null` — выигрыша нет или он не считается матом. */
  mateIn: number | null;
}

/** Больше этого фигур на доске — таблиц для такой позиции не существует. */
const TABLEBASE_PIECES = 7;
/** Дольше этого не ждём: без таблиц он просто играет движком. */
const TABLEBASE_MS = 1200;
const TABLEBASE_URL = "https://tablebase.lichess.ovh/standard";

/**
 * Безошибочный эндшпиль по готовым таблицам.
 *
 * Свои таблицы весят под гигабайт на пять фигур и сотни — на шесть; у Lichess
 * есть открытый запрос по позиции, и Магнусу этого хватает с избытком
 * (src/games/chess/docs/BACKLOG.md D3).
 *
 * Любая осечка — молчаливый `null`: партия не должна зависеть от чужого
 * сервера. Тогда он просто играет движком, как все.
 */
export async function perfect(fen: string): Promise<Perfect | null> {
  if (pieces(fen) > TABLEBASE_PIECES) return null;

  try {
    const answer = await fetch(
      `${TABLEBASE_URL}?fen=${encodeURIComponent(fen)}`,
      { signal: AbortSignal.timeout(TABLEBASE_MS) },
    );
    if (!answer.ok) return null;

    const found = (await answer.json()) as {
      category?: string;
      dtm?: number | null;
      moves?: { uci?: string }[];
    };

    const move = found.moves?.[0]?.uci;
    if (typeof move !== "string") return null;

    // dtm считается в полуходах и со знаком того, чей ход. Объявляем только
    // свой мат: чужой объявлять — не жульничество, а любезность.
    const dtm = found.dtm ?? null;
    const winning = found.category === "win" && dtm !== null && dtm > 0;

    return { move, mateIn: winning ? Math.ceil(dtm / 2) : null };
  } catch {
    return null;
  }
}

/** Сколько фигур на доске, включая пешки и королей. */
function pieces(fen: string): number {
  let count = 0;
  for (const letter of fen.split(" ")[0] ?? "") {
    if (/[a-zA-Z]/.test(letter)) count += 1;
  }

  return count;
}

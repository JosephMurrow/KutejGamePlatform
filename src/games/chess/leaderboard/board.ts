import { prisma } from "@/lib/prisma";
import { provisional } from "../rating/read";
import { TOP_SIZE, type ChessBoard, type ChessRow } from "./shape";

/**
 * Таблица рейтинга.
 *
 * Столбцы заданы гейм-дизайном: ник, рейтинг общего зала, сколько партий
 * сыграно и суммарный рейтинг. Сортировка — по суммарному
 * (src/games/chess/docs/BACKLOG.md E2).
 *
 * Суммарный складывается из рейтинга зала и накопленной надбавки, и сортировать
 * по нему средствами базы нечем: это не колонка, а сумма двух. Поэтому строки
 * зачёта берутся целиком и раскладываются здесь. Пока играющих сотни, это
 * дешевле лишней колонки, которая умеет рассинхронизироваться; когда их станут
 * десятки тысяч, сумму придётся хранить.
 */

/**
 * Кого показываем.
 *
 * Боты и гости отсекаются явно. В шахматах ни тех, ни других за столом быть не
 * должно — бот не игрок платформы с точки зрения базы, а гостя игра не пускает
 * вовсе, — но одна забытая выборка, и чужой ник окажется в общей таблице
 * (src/games/chess/docs/BACKLOG.md E2, G).
 */
const HUMAN = { isBot: false, isGuest: false } as const;

export async function loadBoard(viewerId: string): Promise<ChessBoard> {
  const stored = await prisma.chessRating.findMany({
    where: { games: { gt: 0 }, user: HUMAN },
    select: {
      userId: true,
      rating: true,
      deviation: true,
      ratedAt: true,
      games: true,
      bonus: true,
      user: { select: { nickname: true, avatarId: true } },
    },
  });

  const now = new Date();
  const all = stored
    .map((row) => ({
      rank: 0,
      userId: row.userId,
      nickname: row.user.nickname,
      avatarId: row.user.avatarId,
      rating: Math.round(row.rating),
      provisional: provisional(row, now),
      games: row.games,
      sum: round(row.rating + row.bonus),
    }))
    .sort(compare);

  // Провизорный в верхушку не идёт: пять партий подряд с сильным соперником
  // поднимают его выше, чем он заслуживает. Себя он всё равно увидит — строкой
  // под таблицей.
  const ranked = all
    .filter((row) => !row.provisional)
    .map((row, at) => ({ ...row, rank: at + 1 }));

  const rows = ranked.slice(0, TOP_SIZE);
  const mine =
    ranked.find((row) => row.userId === viewerId) ??
    all.find((row) => row.userId === viewerId) ??
    null;

  return {
    rows,
    you: rows.some((row) => row.userId === viewerId) ? null : mine,
    players: ranked.length,
  };
}

/**
 * Порядок: выше суммарный — выше место. При равном суммарном выше тот, кто
 * добился его меньшим числом партий: рейтинг ценнее усидчивости.
 */
function compare(a: ChessRow, b: ChessRow): number {
  if (b.sum !== a.sum) return b.sum - a.sum;
  if (a.games !== b.games) return a.games - b.games;

  return a.nickname.localeCompare(b.nickname, "ru");
}

/** Суммарный показываем с десятыми: надбавка меньше единицы за партию. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

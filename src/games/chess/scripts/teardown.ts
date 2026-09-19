import { prisma } from "@/lib/prisma";

/**
 * Уборка шахматного смоука без гонки с записью партии.
 *
 * Смоук удаляет комнату и своих пользователей прямо из базы, а комната в
 * памяти сервера об этом не знает и живёт дальше. Если партия там не
 * закончена и в ней есть хоть один ход, через 15 секунд отсрочки платформы и
 * 90 секунд ожидания беглеца (или по флагу) шахматы засчитывают уход и пишут
 * партию — со ссылками на уже удалённых пользователей. В логе сервера это
 * «партия не записана: … matches_whiteId_fkey», примерно через две минуты
 * после того, как смоук отчитался зелёным (docs/TESTING.md, «Грабли
 * смоуков»).
 *
 * Лечится порядком: сперва партию закончить (сдаться), дождаться её записи и
 * только потом удалять. Законченная партия уход уже не засчитывает.
 */
export async function waitForMatch(
  roomKey: string,
  timeoutMs = 5_000,
): Promise<boolean> {
  const until = Date.now() + timeoutMs;

  while (Date.now() < until) {
    const found = await prisma.chessMatch.findFirst({
      where: { roomKey },
      select: { id: true },
    });
    if (found) return true;

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false;
}

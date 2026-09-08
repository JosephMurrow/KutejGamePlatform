/** Как часто подметать. Всё, что здесь чистится, терпит пятиминутную задержку. */
const CLEANUP_EVERY_MS = 5 * 60 * 1000;

/** Одно дело уборки: подмести своё и не уронить остальных. */
export type Sweeper = () => Promise<void>;

/**
 * Общий таймер уборки. Заводить отдельный интервал под каждый запрос раз в
 * пять минут незачем, но и складывать чужие дела в модуль комнат — тоже:
 * пусть каждый приносит своего подметальщика, а состав собирается там, где
 * собирается сервер.
 *
 * Возвращает функцию остановки.
 */
export function startCleanup(sweepers: readonly Sweeper[]): () => void {
  const sweep = async () => {
    for (const sweeper of sweepers) {
      try {
        await sweeper();
      } catch (error) {
        console.error("[уборка] подметальщик упал:", error);
      }
    }
  };

  const timer = setInterval(() => void sweep(), CLEANUP_EVERY_MS);
  timer.unref?.();

  return () => clearInterval(timer);
}

import { avatarSrc, getAvatar } from "@/lib/avatars";
import { botAvatarPackFor, isBotAvatarId } from "@/lib/games/registry";

/**
 * Аватар игрока — картинка, а не рисунок в коде (docs/BACKLOG.md D6).
 *
 * Обычный `<img>`, а не `next/image`: файлы лежат в `public` уже нужного
 * размера, они векторные, и оптимизировать в них нечего — прогон через
 * оптимизатор дал бы растр вместо вектора.
 *
 * Ленивая загрузка обязательна: страница профиля показывает все сорок разом.
 */
export function Avatar({
  id,
  size = 48,
  className,
}: {
  id: number;
  size?: number;
  className?: string;
}) {
  // Служебный диапазон номеров — аватары ботов. Картинки приносит игра:
  // платформа спрашивает реестр и получает адрес, самих игр не зная (D5).
  const bot = isBotAvatarId(id) ? botAvatarPackFor(id) : null;
  const src = bot ? bot.src(id) : avatarSrc(id);

  return (
    // Правило зовёт `next/image`; причина, почему здесь его нет, — выше.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      className={className}
    />
  );
}

/** Как назвать аватар вслух: подсказка при выборе, метка для читалки. */
export function avatarName(id: number): string {
  return getAvatar(id).name;
}

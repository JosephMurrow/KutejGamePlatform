/**
 * Личность зрителя Твича. Платформенное: опознать написавшего и завести ему
 * гостя нужно любой игре, а что он написал — разбирает уже игра
 * (docs/BACKLOG.md A1).
 */

/**
 * Ник для стола. Твич отдаёт `display-name` не всегда — если его нет, берём
 * логин из самого сообщения.
 */
export function twitchNickname(
  displayName: string | undefined,
  login: string,
): string {
  const name = (displayName ?? "").trim();
  return name === "" ? login : name;
}

/** Логин гостя, заведённого под зрителя Твича. Идентификатор стабилен, ник — нет. */
export function twitchLogin(userId: string): string {
  return `twitch_${userId}`;
}

/** Имя канала как его понимает IRC: в нижнем регистре и без решётки. */
export function normalizeChannel(raw: string): string | null {
  const channel = raw
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/^https?:\/\/(www\.)?twitch\.tv\//, "")
    .replace(/\/.*$/, "");

  return /^[a-z0-9_]{3,25}$/.test(channel) ? channel : null;
}

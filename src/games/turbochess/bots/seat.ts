import { randomUUID } from "node:crypto";
import type { Side } from "../engine/pieces";
import { roller } from "../modes/random";
import { botAvatarId } from "./avatars";
import {
  CHARACTER_TRAITS,
  CHARACTERS,
  type Character,
  type CharacterTraits,
  drawCharacters,
  nicknameOf,
} from "./characters";
import { LEVELS, type Level, type LevelId } from "./levels";

/**
 * Бот за столом: кто он такой с точки зрения комнаты.
 *
 * Комната не знает ни про перебор, ни про характеры — ей нужны имя, лицо,
 * уровень и то, чем думать. Всё остальное живёт в `mind.ts`.
 */
export interface BotSeat {
  /** Служебный номер игрока платформы. У живых он свой, у бота — с префиксом. */
  id: string;
  nickname: string;
  avatarId: number;
  level: Level;
  character: Character;
  traits: CharacterTraits;
}

/** Признак бота по номеру игрока: комната по нему решает, чей сейчас ход. */
export function isBot(playerId: string): boolean {
  return playerId.startsWith("bot:");
}

/**
 * Собрать ботов для комнаты.
 *
 * Характеры за одним столом всегда разные (docs/BOTS.md, А8): уровень человек
 * выбрал сам, и различать ботов будут именно характеры — трое одинаковых за
 * столом это скучно.
 *
 * Зерно партии здесь не годится: боты садятся до её начала, а зерно меняется с
 * каждой новой партией — иначе после реванша за столом оказались бы другие
 * люди.
 */
export function makeBots(
  count: number,
  level: LevelId,
  seed: number,
): BotSeat[] {
  const roll = roller(seed, 77);
  const chosen = drawCharacters(Math.max(0, count), roll);

  return chosen.map((character) => ({
    id: `bot:${randomUUID()}`,
    nickname: nicknameOf(character, roll()),
    avatarId: botAvatarId(index(character)),
    level: LEVELS[level],
    character,
    traits: CHARACTER_TRAITS[character],
  }));
}

/** Номер лица характера: лицо рисуется под характер, а не под место за столом. */
function index(character: Character): number {
  return CHARACTERS.indexOf(character);
}

/** Как бот записывается в сыгранную партию: места, характеры и уровень. */
export interface BotRecord {
  seat: Side;
  character: Character;
  level: LevelId;
  nickname: string;
}

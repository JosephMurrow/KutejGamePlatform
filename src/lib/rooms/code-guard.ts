import { RateLimiter } from "../../server/rate-limit";
import { securityLog } from "../../server/security-log";
import { ROOM_CODE_LENGTH } from "@/shared/room-settings";
import {
  findPrivateRoom,
  ROOM_CODE_ALPHABET,
  type PrivateRoomInfo,
} from "./private";

/**
 * Поиск комнаты по коду с лимитом на промахи (docs/SECURITY.md, S-D1).
 *
 * Код — шесть знаков из 32, около миллиарда вариантов. Живых комнат мало, и
 * перебором их находят: приватная пускает любого вошедшего, стримерская — даже
 * гостя. Поэтому промахи по коду считаются на адрес клиента, и после
 * `CODE_MISSES` за окно адрес получает отказ, даже с верным кодом, — уже без
 * похода в базу. Попадание лимит не тратит: человек со своим кодом его не
 * заметит.
 *
 * Счётчик один на все двери: сокет, вход по коду, гостевой вход, страница
 * комнаты, экран и иконка вкладки (иконка тоже выдаёт, есть ли комната: знак
 * игры против знака платформы). Лежит он в `globalThis`, потому что страницы
 * и экшены Next собраны своим бандлом, а сокет-сервер грузит исходники
 * напрямую: у каждого был бы свой экземпляр модуля и свой счётчик.
 */

/** Промахов с одного адреса за окно. */
export const CODE_MISSES = 20;
/** Окно счётчика промахов. */
export const CODE_WINDOW_MS = 10 * 60 * 1000;

const HOLDER = Symbol.for("kutezh.roomCodeGuard");

function misses(): RateLimiter {
  const store = globalThis as { [HOLDER]?: RateLimiter };
  store[HOLDER] ??= new RateLimiter(CODE_MISSES, CODE_WINDOW_MS);
  return store[HOLDER];
}

/** Похоже ли на код комнаты: длина и алфавит. Мусор в базу не носим. */
export function looksLikeCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  return [...code.toUpperCase()].every((char) =>
    ROOM_CODE_ALPHABET.includes(char),
  );
}

export interface CodeLookup {
  room: PrivateRoomInfo | null;
  /** Адрес исчерпал промахи: комнату даже не искали. */
  blocked: boolean;
}

/** Найти комнату по коду, считая промахи адреса. */
export async function findRoomByCode(
  code: string,
  address: string,
): Promise<CodeLookup> {
  const limiter = misses();
  if (limiter.blocked(address)) {
    securityLog("коды: отказ по лимиту промахов", { address }, address);
    return { room: null, blocked: true };
  }

  const room = looksLikeCode(code) ? await findPrivateRoom(code) : null;
  if (!room) limiter.hit(address);

  return { room, blocked: false };
}

/** Что сказать человеку, упёршемуся в лимит. */
export const CODE_BLOCKED_REASON =
  "Слишком много неверных кодов подряд. Подожди десять минут и проверь код.";

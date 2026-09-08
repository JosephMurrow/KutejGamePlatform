import type { GameHost, GameRoomContext, GameServer } from "@/lib/games/engine";
import { BotDirector, BOT_LIMIT, BOT_PARTY_SIZE } from "../bots/director";
import type { GameEvent } from "../engine/room";
import { PricetituteRoom, type BotAccess } from "./room";

/**
 * Серверная часть платитутки: живые партии, режиссёр ботов и всё, что игра
 * держит у себя на весь срок жизни процесса.
 *
 * Платформа знает про этот объект ровно то, что описано в `GameServer`.
 */
class PricetituteServer implements GameServer {
  private readonly rooms = new Map<string, PricetituteRoom>();
  private readonly director: BotDirector;

  constructor(host: GameHost) {
    this.director = new BotDirector(
      { get: (key) => this.rooms.get(key) },
      { sendChat: host.sendChat },
    );
    this.director.start();
  }

  async createRoom(context: GameRoomContext): Promise<PricetituteRoom> {
    const bots: BotAccess = {
      count: (key) => this.director.count(key),
      limit: BOT_LIMIT,
      defaultPartySize: BOT_PARTY_SIZE,
      hasParty: (key) => this.director.hasParty(key),
      fill: (key, count, kind) => this.director.fill(key, count, kind),
      farewell: (key) => this.director.farewell(key),
      react: (key, events: GameEvent[]) => this.director.react(key, events),
    };

    const room = await PricetituteRoom.create(context, bots);
    this.rooms.set(context.key, room);

    return room;
  }

  closeRoom(key: string): void {
    this.rooms.delete(key);
  }

  stop(): void {
    this.director.stop();
    this.rooms.clear();
  }
}

export function createPricetituteServer(host: GameHost): GameServer {
  return new PricetituteServer(host);
}

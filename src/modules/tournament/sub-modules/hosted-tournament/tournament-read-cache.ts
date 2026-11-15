import { mongo } from "mongoose";
import type {
  TournamentLeague,
  TournamentTierListMeta,
} from "./hosted-tournament.mapper";

export const TOURNAMENT_READ_TTL_MS = 10_000;
const MAX_ENTRIES = 500;

export type TournamentSnapshot = {
  doc: object;
  league: TournamentLeague;
  stages: object[];
  meta: TournamentTierListMeta;
};

type Entry = { expires: number; bytes: Uint8Array };

export class TournamentReadCache {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly ttlMs = TOURNAMENT_READ_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): TournamentSnapshot | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return mongo.BSON.deserialize(entry.bytes) as TournamentSnapshot;
  }

  set(key: string, snapshot: TournamentSnapshot): void {
    this.entries.delete(key);
    this.entries.set(key, {
      expires: this.now() + this.ttlMs,
      bytes: mongo.BSON.serialize(snapshot, { ignoreUndefined: true }),
    });
    if (this.entries.size <= MAX_ENTRIES) return;
    const oldest = this.entries.keys().next().value;
    if (oldest !== undefined) this.entries.delete(oldest);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

export const tournamentReadCache = new TournamentReadCache();

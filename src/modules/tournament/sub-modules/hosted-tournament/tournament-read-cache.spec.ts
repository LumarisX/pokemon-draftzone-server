import { StageSchema } from "@modules/stage/stage.schema";
import mongoose, { Types } from "mongoose";
import { HostedTournamentMapper } from "./hosted-tournament.mapper";
import { HostedTournamentSchema } from "./hosted-tournament.schema";
import { TournamentReadCache, tournamentReadCache } from "./tournament-read-cache";

describe("TournamentReadCache", () => {
  const db = new mongoose.Mongoose();
  const Tournament = db.model("ReadCacheTournament", HostedTournamentSchema);
  const Stage = db.model("ReadCacheStage", StageSchema);
  const league = { owner: "auth0|owner", slug: "pdz", name: "PDZ" };

  function fixture() {
    const doc = new Tournament({
      name: "Spring Cup",
      slug: "spring-cup",
      signUpDeadline: new Date("2026-09-01T00:00:00Z"),
      league: new Types.ObjectId(),
      staff: [{ sub: "auth0|organizer", name: "Org", role: "organizer" }],
      tierList: new Types.ObjectId(),
      rules: [{ title: "Bans", body: "No Shedinja" }],
      rounds: [{ name: "Week 1" }],
      trades: [
        {
          side1: { team: new Types.ObjectId(), pokemon: [] },
          side2: { team: new Types.ObjectId(), pokemon: [] },
          status: "APPROVED",
          timestamp: new Date("2026-10-01T00:00:00Z"),
        },
      ],
      tradesVersion: 4,
      forfeit: { gameDiff: 2, pokemonDiff: 6 },
      diffMode: "game",
      draftCount: { min: 8, max: 11 },
      pointTotal: 100,
    });
    const stage = new Stage({
      tournamentId: doc._id,
      name: "Regular Season",
      slug: "regular",
      type: "round-robin",
      order: 0,
    });
    return { doc, stage };
  }

  it("rebuilds the same tournament it was given", () => {
    const cache = new TournamentReadCache();
    const { doc, stage } = fixture();
    const meta = { format: "Singles", ruleset: "Gen9 NatDex" };

    cache.set("k", {
      doc: doc.toObject(),
      league,
      stages: [stage.toObject()],
      meta,
    });
    const hit = cache.get("k")!;
    const rebuilt = HostedTournamentMapper.fromDatabase(
      Tournament.hydrate(hit.doc),
      hit.league,
      hit.stages.map((raw) => Stage.hydrate(raw)),
      hit.meta,
    );
    const original = HostedTournamentMapper.fromDatabase(
      doc,
      league,
      [stage],
      meta,
    );

    expect(JSON.stringify(rebuilt)).toEqual(JSON.stringify(original));
    expect(rebuilt.maxTeams).toBeUndefined();
    expect(rebuilt.stages[0]._id.equals(stage._id)).toBe(true);
  });

  it("hands each reader its own copy", () => {
    const cache = new TournamentReadCache();
    const { doc } = fixture();
    cache.set("k", { doc: doc.toObject(), league, stages: [], meta: null });

    const first = cache.get("k")! as { doc: { staff: unknown[] } };
    first.doc.staff.length = 0;

    const second = cache.get("k")! as { doc: { staff: unknown[] } };
    expect(second.doc.staff).toHaveLength(1);
  });

  it("expires entries after the time to live", () => {
    let now = 0;
    const cache = new TournamentReadCache(1000, () => now);
    cache.set("k", { doc: {}, league, stages: [], meta: null });

    now = 999;
    expect(cache.get("k")).toBeDefined();
    now = 1000;
    expect(cache.get("k")).toBeUndefined();
  });

  it("is cleared by any write to a tournament", async () => {
    tournamentReadCache.set("k", { doc: {}, league, stages: [], meta: null });
    const hooks = (
      HostedTournamentSchema as unknown as {
        s: { hooks: { _posts: Map<string, { fn: () => void }[]> } };
      }
    ).s.hooks._posts;

    for (const name of ["updateOne", "findOneAndUpdate", "save"]) {
      tournamentReadCache.set("k", { doc: {}, league, stages: [], meta: null });
      const ours = (hooks.get(name) ?? []).filter(
        (hook) => hook.fn.name === "clearTournamentReads",
      );
      expect(ours).toHaveLength(1);
      ours[0].fn();
      expect(tournamentReadCache.size).toBe(0);
    }
  });
});

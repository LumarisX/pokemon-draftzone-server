import { Types } from "mongoose";
import { ArchiveMapper } from "./archive.mapper";
import { ArchiveV1, ArchiveV2, Stat } from "./archive.domain";
import {
  ArchiveV1Document,
  ArchiveV2Document,
} from "./archive.schema";

function buildV1Doc(overrides: Record<string, unknown> = {}): ArchiveV1Document {
  return {
    _id: new Types.ObjectId(),
    archiveType: "ArchiveV1",
    leagueName: "Spring League",
    teamName: "Team Rocket",
    owner: "auth0|owner",
    format: "Singles",
    ruleset: "Gen9 NatDex",
    team: [{ id: "pikachu" }],
    matches: [],
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
    ...overrides,
  } as unknown as ArchiveV1Document;
}

function buildV2Doc(overrides: Record<string, unknown> = {}): ArchiveV2Document {
  return {
    _id: new Types.ObjectId(),
    archiveType: "ArchiveV2",
    leagueName: "Spring League",
    teamName: "Team Rocket",
    owner: "auth0|owner",
    format: "Singles",
    ruleset: "Gen9 NatDex",
    team: [{ id: "pikachu" }],
    leagueId: "league-1",
    doc: "doc-key",
    stats: new Map([["pikachu", { kills: 3, brought: 2 }]]),
    score: { wins: 1, losses: 0, diff: "+1" },
    matchups: [],
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
    ...overrides,
  } as unknown as ArchiveV2Document;
}

describe("ArchiveMapper.fromDatabase", () => {
  it("routes to v1FromDocument for an ArchiveV1 document", () => {
    const doc = buildV1Doc();

    const result = ArchiveMapper.fromDatabase(doc);

    expect(result).toBeInstanceOf(ArchiveV1);
    expect(result.id).toBe(doc._id.toString());
    expect(result.team).toEqual(["pikachu"]);
  });

  it("routes to v2FromDocument for an ArchiveV2 document", () => {
    const doc = buildV2Doc();

    const result = ArchiveMapper.fromDatabase(doc);

    expect(result).toBeInstanceOf(ArchiveV2);
  });

  it("extracts only the bare id from each team Pokemon entry", () => {
    const doc = buildV1Doc({ team: [{ id: "pikachu" }, { id: "charizard" }] });

    expect(ArchiveMapper.fromDatabase(doc).team).toEqual(["pikachu", "charizard"]);
  });

  it("maps v1 matches, including their stat tuples", () => {
    const doc = buildV1Doc({
      matches: [
        {
          winner: "a",
          teamName: "Challenger",
          stage: "Round 1",
          stats: [["pikachu", { kills: 2 }]],
          score: [1, 0],
          replay: "replay-1",
        },
      ],
    });

    const result = ArchiveMapper.fromDatabase(doc) as ArchiveV1;

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      winner: "a",
      teamName: "Challenger",
      stage: "Round 1",
      score: [1, 0],
      replay: "replay-1",
    });
    expect(result.matches[0].stats.get("pikachu")).toEqual(new Stat({ kills: 2 }));
  });

  it("tolerates a v1 document with missing matches/team (legacy/raw-inserted docs)", () => {
    const doc = buildV1Doc({ matches: undefined, team: undefined });

    const result = ArchiveMapper.fromDatabase(doc) as ArchiveV1;

    expect(result.matches).toEqual([]);
    expect(result.team).toEqual([]);
  });

  it("tolerates a v1 match with missing stat tuples", () => {
    const doc = buildV1Doc({
      matches: [{ stage: "Round 1", score: [0, 0] }],
    });

    const result = ArchiveMapper.fromDatabase(doc) as ArchiveV1;

    expect(result.matches[0].stats).toEqual(new Map());
  });

  it("tolerates a v2 document with missing stats/score/matchups", () => {
    const doc = buildV2Doc({
      stats: undefined,
      score: undefined,
      matchups: undefined,
    });

    const result = ArchiveMapper.fromDatabase(doc) as ArchiveV2;

    expect(result.stats).toEqual(new Map());
    expect(result.score).toEqual({ wins: 0, losses: 0, diff: "0" });
    expect(result.matchups).toEqual([]);
  });

  it("maps v2 stats/score/matchups, converting the stats Map's values to Stat instances", () => {
    const doc = buildV2Doc();

    const result = ArchiveMapper.fromDatabase(doc) as ArchiveV2;

    expect(result.leagueId).toBe("league-1");
    expect(result.doc).toBe("doc-key");
    expect(result.score).toEqual({ wins: 1, losses: 0, diff: "+1" });
    expect(result.stats.get("pikachu")).toEqual(new Stat({ kills: 3, brought: 2 }));
  });

  it("maps a v2 matchup's nested matches and stats", () => {
    const doc = buildV2Doc({
      matchups: [
        {
          teamName: "Challenger",
          coach: "coach-1",
          team: [],
          paste: undefined,
          pastes: { aTeam: "a-paste", bTeam: "b-paste" },
          stage: "Round 1",
          matches: [
            {
              aTeam: { stats: [["pikachu", { kills: 1 }]], score: 1 },
              bTeam: { stats: [], score: 0 },
              winner: "a",
              replay: "replay-1",
            },
          ],
          stats: {
            winner: "a",
            aTeam: { wins: 1, stats: new Map([["pikachu", { kills: 1 }]]), differential: 1 },
            bTeam: { wins: 0, stats: new Map(), differential: 0 },
          },
        },
      ],
    });

    const result = ArchiveMapper.fromDatabase(doc) as ArchiveV2;

    expect(result.matchups).toHaveLength(1);
    const matchup = result.matchups[0];
    expect(matchup.teamName).toBe("Challenger");
    expect(matchup.pastes).toEqual({ aTeam: "a-paste", bTeam: "b-paste" });
    expect(matchup.matches[0].aTeam.stats.get("pikachu")).toEqual(new Stat({ kills: 1 }));
    expect(matchup.stats.winner).toBe("a");
    expect(matchup.stats.aTeam).toMatchObject({ wins: 1, differential: 1 });
  });
});

describe("ArchiveMapper.toListItem", () => {
  it("resolves each team Pokemon's display name and includes the score for an ArchiveV2", () => {
    const archive = new ArchiveV2({
      id: "archive-1",
      leagueName: "Spring League",
      teamName: "Team Rocket",
      owner: "auth0|owner",
      format: "Singles",
      ruleset: "Gen9 NatDex",
      team: ["pikachu"],
      leagueId: "league-1",
      matchups: [],
      stats: new Map(),
      score: { wins: 1, losses: 0, diff: "+1" },
    });

    const result = ArchiveMapper.toListItem(archive);

    expect(result).toEqual({
      _id: "archive-1",
      leagueName: "Spring League",
      teamName: "Team Rocket",
      owner: "auth0|owner",
      format: "Singles",
      ruleset: "Gen9 NatDex",
      team: [{ id: "pikachu", name: "Pikachu" }],
      score: { wins: 1, losses: 0, diff: "+1" },
    });
  });

  it("omits score for an ArchiveV1", () => {
    const archive = new ArchiveV1({
      id: "archive-1",
      leagueName: "Spring League",
      teamName: "Team Rocket",
      owner: "auth0|owner",
      format: "Singles",
      ruleset: "Gen9 NatDex",
      team: ["pikachu"],
      matches: [],
    });

    expect(ArchiveMapper.toListItem(archive).score).toBeUndefined();
  });

  it("resolves an empty name for a team id that doesn't exist in the ruleset", () => {
    const archive = new ArchiveV1({
      leagueName: "Spring League",
      teamName: "Team Rocket",
      owner: "auth0|owner",
      format: "Singles",
      ruleset: "Gen9 NatDex",
      team: ["notarealpokemon"],
      matches: [],
    });

    expect(ArchiveMapper.toListItem(archive).team).toEqual([
      { id: "notarealpokemon", name: "" },
    ]);
  });
});

describe("ArchiveMapper.toV2EntityProps", () => {
  it("wraps each team id back into a Pokemon ref shape", () => {
    const archive = new ArchiveV2({
      leagueName: "Spring League",
      teamName: "Team Rocket",
      owner: "auth0|owner",
      format: "Singles",
      ruleset: "Gen9 NatDex",
      team: ["pikachu", "charizard"],
      leagueId: "league-1",
      matchups: [],
      stats: new Map(),
      score: { wins: 0, losses: 0, diff: "0" },
    });

    expect(ArchiveMapper.toV2EntityProps(archive).team).toEqual([
      { id: "pikachu" },
      { id: "charizard" },
    ]);
  });

  it("flattens each matchup's stat Maps back into persisted tuple arrays", () => {
    const archive = new ArchiveV2({
      leagueName: "Spring League",
      teamName: "Team Rocket",
      owner: "auth0|owner",
      format: "Singles",
      ruleset: "Gen9 NatDex",
      team: [],
      leagueId: "league-1",
      stats: new Map(),
      score: { wins: 0, losses: 0, diff: "0" },
      matchups: [
        {
          teamName: "Challenger",
          team: [],
          pastes: {},
          stage: "Round 1",
          matches: [
            {
              aTeam: { stats: new Map([["pikachu", new Stat({ kills: 1 })]]), score: 1 },
              bTeam: { stats: new Map(), score: 0 },
              winner: "a",
            },
          ],
          stats: {
            aTeam: { wins: 1, stats: new Map(), differential: 1 },
            bTeam: { wins: 0, stats: new Map(), differential: 0 },
          },
        } as any,
      ],
    });

    const result = ArchiveMapper.toV2EntityProps(archive);

    expect(result.matchups[0].matches[0].aTeam.stats).toEqual([
      ["pikachu", new Stat({ kills: 1 })],
    ]);
  });
});

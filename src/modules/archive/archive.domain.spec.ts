import { ExternalMatchupDocument } from "@modules/matchup/sub-modules/external-matchup/external-matchup.schema";
import {
  ArchiveMatchupV2,
  ArchiveMatchV1,
  ArchiveV1,
  ArchiveV2,
  Stat,
} from "./archive.domain";

function buildExternalMatchupDoc(
  overrides: Record<string, unknown> = {},
): ExternalMatchupDocument {
  return {
    stage: "Round 1",
    aTeam: { paste: "a-paste" },
    bTeam: { teamName: "Challenger", coach: "coach-1", team: [], paste: "b-paste" },
    matches: [],
    ...overrides,
  } as unknown as ExternalMatchupDocument;
}

describe("ArchiveV1.computeStats", () => {
  function buildArchiveV1(matches: ArchiveMatchV1[]) {
    return new ArchiveV1({
      leagueName: "Spring League",
      teamName: "Team Rocket",
      owner: "auth0|owner",
      format: "Singles",
      ruleset: "Gen9 NatDex",
      team: ["pikachu"],
      matches,
    });
  }

  it("returns an empty pokemon list when there are no matches", () => {
    expect(buildArchiveV1([]).computeStats()).toEqual({ pokemon: [] });
  });

  it("sums kills/brought/indirect/deaths across matches for the same Pokemon, and resolves its name", () => {
    const archive = buildArchiveV1([
      new ArchiveMatchV1({
        stage: "Round 1",
        score: [1, 0],
        stats: new Map([["pikachu", new Stat({ kills: 2, brought: 1 })]]),
      }),
      new ArchiveMatchV1({
        stage: "Round 2",
        score: [1, 0],
        stats: new Map([
          ["pikachu", new Stat({ kills: 1, indirect: 1, brought: 1, deaths: 1 })],
        ]),
      }),
    ]);

    const stats = archive.computeStats();

    expect(stats.pokemon).toHaveLength(1);
    expect(stats.pokemon[0]).toMatchObject({
      pokemon: { id: "pikachu", name: "Pikachu" },
      kills: 3,
      brought: 2,
      indirect: 1,
      deaths: 1,
    });
  });

  it("computes kdr as kills + indirect - deaths", () => {
    const archive = buildArchiveV1([
      new ArchiveMatchV1({
        stage: "Round 1",
        score: [1, 0],
        stats: new Map([
          ["pikachu", new Stat({ kills: 5, indirect: 2, deaths: 3 })],
        ]),
      }),
    ]);

    expect(archive.computeStats().pokemon[0].kdr).toBe(4);
  });

  it("computes kpg as (kills + indirect) / brought, or 0 when never brought", () => {
    const archive = buildArchiveV1([
      new ArchiveMatchV1({
        stage: "Round 1",
        score: [1, 0],
        stats: new Map([
          ["pikachu", new Stat({ kills: 4, indirect: 2, brought: 3 })],
          ["charizard", new Stat({ kills: 1, brought: 0 })],
        ]),
      }),
    ]);

    const stats = archive.computeStats();
    expect(stats.pokemon.find((p) => p.pokemon.id === "pikachu")?.kpg).toBeCloseTo(2);
    expect(stats.pokemon.find((p) => p.pokemon.id === "charizard")?.kpg).toBe(0);
  });

  it("resolves an empty name for an id that doesn't exist in the ruleset", () => {
    const archive = buildArchiveV1([
      new ArchiveMatchV1({
        stage: "Round 1",
        score: [1, 0],
        stats: new Map([["notarealpokemon", new Stat({ kills: 1 })]]),
      }),
    ]);

    expect(archive.computeStats().pokemon[0].pokemon.name).toBe("");
  });
});

describe("ArchiveV2.computeStats", () => {
  it("maps the archive's precomputed stats map to stat rows", () => {
    const archive = new ArchiveV2({
      leagueName: "Spring League",
      teamName: "Team Rocket",
      owner: "auth0|owner",
      format: "Singles",
      ruleset: "Gen9 NatDex",
      team: ["pikachu"],
      leagueId: "league-1",
      matchups: [],
      stats: new Map([["pikachu", new Stat({ kills: 3, brought: 2 })]]),
      score: { wins: 1, losses: 0, diff: "+1" },
    });

    const stats = archive.computeStats();

    expect(stats.pokemon).toHaveLength(1);
    expect(stats.pokemon[0]).toMatchObject({
      pokemon: { id: "pikachu", name: "Pikachu" },
      kills: 3,
      brought: 2,
    });
  });
});

describe("ArchiveMatchupV2.fromMatchup", () => {
  it("takes teamName/coach/team from the matchup's bTeam (the opponent)", () => {
    const doc = buildExternalMatchupDoc({
      bTeam: { teamName: "Challenger", coach: "coach-1", team: [{ id: "pikachu" }] },
    });

    const result = ArchiveMatchupV2.fromMatchup(doc);

    expect(result.teamName).toBe("Challenger");
    expect(result.coach).toBe("coach-1");
    expect(result.team).toEqual([{ id: "pikachu" }]);
  });

  it("takes pastes from aTeam.paste and bTeam.paste", () => {
    const doc = buildExternalMatchupDoc({
      aTeam: { paste: "a-paste" },
      bTeam: { teamName: "Challenger", team: [], paste: "b-paste" },
    });

    const result = ArchiveMatchupV2.fromMatchup(doc);

    expect(result.pastes).toEqual({ aTeam: "a-paste", bTeam: "b-paste" });
  });

  it("normalizes an invalid/missing winner to undefined", () => {
    const doc = buildExternalMatchupDoc({
      matches: [
        {
          aTeam: { stats: [], score: 1 },
          bTeam: { stats: [], score: 0 },
          winner: "garbage",
        },
      ],
    });

    const result = ArchiveMatchupV2.fromMatchup(doc);

    expect(result.matches[0].winner).toBeUndefined();
  });

  it("preserves a valid winner", () => {
    const doc = buildExternalMatchupDoc({
      matches: [
        { aTeam: { stats: [], score: 1 }, bTeam: { stats: [], score: 0 }, winner: "a" },
      ],
    });

    expect(ArchiveMatchupV2.fromMatchup(doc).matches[0].winner).toBe("a");
  });

  describe("computeMatchupStats", () => {
    it("returns a zeroed, winnerless result when there are no matches", () => {
      const doc = buildExternalMatchupDoc({ matches: [] });

      const result = ArchiveMatchupV2.fromMatchup(doc);

      expect(result.stats.winner).toBeUndefined();
      expect(result.stats.aTeam).toMatchObject({ wins: 0, differential: 0 });
      expect(result.stats.bTeam).toMatchObject({ wins: 0, differential: 0 });
      expect(result.stats.aTeam.stats.size).toBe(0);
    });

    it("declares the side with more game wins as the matchup winner", () => {
      const doc = buildExternalMatchupDoc({
        matches: [
          { aTeam: { stats: [], score: 1 }, bTeam: { stats: [], score: 0 }, winner: "a" },
          { aTeam: { stats: [], score: 1 }, bTeam: { stats: [], score: 0 }, winner: "a" },
          { aTeam: { stats: [], score: 0 }, bTeam: { stats: [], score: 1 }, winner: "b" },
        ],
      });

      const result = ArchiveMatchupV2.fromMatchup(doc);

      expect(result.stats.winner).toBe("a");
      expect(result.stats.aTeam.wins).toBe(2);
      expect(result.stats.bTeam.wins).toBe(1);
    });

    it("leaves the matchup winner undefined when game wins are tied", () => {
      const doc = buildExternalMatchupDoc({
        matches: [
          { aTeam: { stats: [], score: 1 }, bTeam: { stats: [], score: 0 }, winner: "a" },
          { aTeam: { stats: [], score: 0 }, bTeam: { stats: [], score: 1 }, winner: "b" },
        ],
      });

      expect(ArchiveMatchupV2.fromMatchup(doc).stats.winner).toBeUndefined();
    });

    it("sums each team's own per-game score into differential", () => {
      const doc = buildExternalMatchupDoc({
        matches: [
          { aTeam: { stats: [], score: 3 }, bTeam: { stats: [], score: 1 } },
          { aTeam: { stats: [], score: 2 }, bTeam: { stats: [], score: 4 } },
        ],
      });

      const result = ArchiveMatchupV2.fromMatchup(doc);

      expect(result.stats.aTeam.differential).toBe(5);
      expect(result.stats.bTeam.differential).toBe(5);
    });

    it("sums kills/indirect by value, but counts brought/deaths as a 0-or-1 occurrence per game", () => {
      const doc = buildExternalMatchupDoc({
        matches: [
          {
            aTeam: {
              stats: [["pikachu", { kills: 2, brought: 5, deaths: 0 }]],
              score: 1,
            },
            bTeam: { stats: [], score: 0 },
          },
          {
            aTeam: {
              stats: [["pikachu", { kills: 1, indirect: 1, brought: 1, deaths: 1 }]],
              score: 1,
            },
            bTeam: { stats: [], score: 0 },
          },
        ],
      });

      const result = ArchiveMatchupV2.fromMatchup(doc);
      const pikachuStats = result.stats.aTeam.stats.get("pikachu");

      expect(pikachuStats).toMatchObject({
        kills: 3,
        indirect: 1,
        brought: 2,
        deaths: 1,
      });
    });
  });
});

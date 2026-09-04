import { getMatchupCoverage } from "@modules/matchup/domain/coverage";
import { getTeamMoves } from "@modules/matchup/domain/movechart";
import { speedchart } from "@modules/matchup/domain/speedchart";
import { summarizeTeam } from "@modules/matchup/domain/summary";
import { getTeamTypechart } from "@modules/matchup/domain/typechart";
import { ExternalMatchup, MatchupSide } from "./external-matchup.domain";

jest.mock("@modules/matchup/domain/coverage", () => ({
  getMatchupCoverage: jest.fn(),
}));
jest.mock("@modules/matchup/domain/movechart", () => ({
  getTeamMoves: jest.fn(),
}));
jest.mock("@modules/matchup/domain/speedchart", () => ({
  speedchart: jest.fn(),
}));
jest.mock("@modules/matchup/domain/summary", () => ({
  summarizeTeam: jest.fn(),
}));
jest.mock("@modules/matchup/domain/typechart", () => ({
  getTeamTypechart: jest.fn(),
}));

const mockedGetMatchupCoverage = getMatchupCoverage as jest.Mock;
const mockedGetTeamMoves = getTeamMoves as jest.Mock;
const mockedSpeedchart = speedchart as jest.Mock;
const mockedSummarizeTeam = summarizeTeam as jest.Mock;
const mockedGetTeamTypechart = getTeamTypechart as jest.Mock;

const RULESET = { name: "Gen9 NatDex" } as any;
const FORMAT = { name: "Singles", level: 100, choose: 6, layout: "1" } as any;

function buildSide(overrides: Partial<MatchupSide> = {}): MatchupSide {
  return {
    team: [],
    teamName: "Team Rocket",
    ...overrides,
  };
}

function buildMatchup(
  overrides: Partial<ConstructorParameters<typeof ExternalMatchup>[0]> = {},
) {
  return new ExternalMatchup({
    aTeam: buildSide({ owner: "auth0|a" }),
    bTeam: buildSide({ owner: "auth0|b" }),
    ruleset: RULESET,
    format: FORMAT,
    ...overrides,
  });
}

describe("ExternalMatchup.calculateScore", () => {
  it("returns null when there are no matches", () => {
    const matchup = buildMatchup({ matches: [] });

    expect(matchup.calculateScore()).toBeNull();
  });

  it("uses the stored per-side scores for a single match", () => {
    const matchup = buildMatchup({
      matches: [
        {
          aTeam: { score: 3, stats: [] },
          bTeam: { score: 1, stats: [] },
        } as any,
      ],
    });

    expect(matchup.calculateScore()).toEqual([3, 1]);
    expect(matchup.calculateWinner()).toBe("a");
  });

  it("treats a missing side as a zero score", () => {
    const matchup = buildMatchup({
      matches: [
        {
          aTeam: { score: 0, stats: undefined },
          bTeam: undefined,
        } as any,
      ],
    });

    expect(matchup.calculateScore()).toEqual([0, 0]);
    expect(matchup.calculateWinner()).toBeUndefined();
  });

  it("tallies series wins across multiple matches by winner field", () => {
    const matchup = buildMatchup({
      matches: [
        { winner: "a", aTeam: { score: 1, stats: [] } } as any,
        { winner: "a", aTeam: { score: 1, stats: [] } } as any,
        { winner: "b", aTeam: { score: 1, stats: [] } } as any,
        { aTeam: { score: 1, stats: [] } } as any,
      ],
    });

    expect(matchup.calculateScore()).toEqual([2, 1]);
    expect(matchup.calculateWinner()).toBe("a");
  });

  it("prefers an explicit score override over the inferred score", () => {
    const matchup = buildMatchup({
      matches: [
        { winner: "a", aTeam: { score: 1, stats: [] } } as any,
        { winner: "a", aTeam: { score: 1, stats: [] } } as any,
      ],
      scoreOverride: [0, 2],
    });

    expect(matchup.inferScore()).toEqual([2, 0]);
    expect(matchup.calculateScore()).toEqual([0, 2]);
    expect(matchup.calculateWinner()).toBe("b");
  });

  it("prefers an explicit winner override over the score comparison", () => {
    const matchup = buildMatchup({
      matches: [
        {
          aTeam: { score: 3, stats: [] },
          bTeam: { score: 1, stats: [] },
        } as any,
      ],
      winnerOverride: "b",
    });

    expect(matchup.calculateScore()).toEqual([3, 1]);
    expect(matchup.calculateWinner()).toBe("b");
  });

  it("awards the win to the side that did not forfeit", () => {
    const matchup = buildMatchup({ matches: [], forfeitedBy: "a" });

    expect(matchup.calculateWinner()).toBe("b");
    expect(matchup.isDoubleForfeit()).toBe(false);
  });

  it("leaves a double forfeit with no winner", () => {
    const matchup = buildMatchup({
      matches: [
        {
          aTeam: { score: 3, stats: [] },
          bTeam: { score: 1, stats: [] },
        } as any,
      ],
      forfeitedBy: "both",
    });

    expect(matchup.calculateWinner()).toBeUndefined();
    expect(matchup.isDoubleForfeit()).toBe(true);
  });

  it("lets a forfeit outrank an explicit winner override", () => {
    const matchup = buildMatchup({
      matches: [],
      forfeitedBy: "b",
      winnerOverride: "b",
    });

    expect(matchup.calculateWinner()).toBe("a");
  });

  it("leaves the winner undecided when a series is tied and nothing is overridden", () => {
    const matchup = buildMatchup({
      matches: [
        { winner: "a", aTeam: { score: 1, stats: [] } } as any,
        { winner: "b", aTeam: { score: 1, stats: [] } } as any,
      ],
    });

    expect(matchup.calculateWinner()).toBeUndefined();
  });
});

describe("ExternalMatchup.analyze", () => {
  beforeEach(() => {
    mockedGetMatchupCoverage.mockResolvedValue({ coverage: true });
    mockedGetTeamMoves.mockResolvedValue({ moves: true });
    mockedSpeedchart.mockReturnValue({ speed: true });
    mockedSummarizeTeam.mockReturnValue({ summary: true });
    mockedGetTeamTypechart.mockReturnValue({ typechart: true });
  });

  it("keeps aTeam/bTeam order when sub matches aTeam's owner", async () => {
    const aTeam = buildSide({ owner: "auth0|a", teamName: "A Team" });
    const bTeam = buildSide({ owner: "auth0|b", teamName: "B Team" });
    const matchup = buildMatchup({ aTeam, bTeam });

    await matchup.analyze("auth0|a");

    expect(mockedGetMatchupCoverage).toHaveBeenCalledWith(aTeam.team, bTeam.team);
    expect(mockedSummarizeTeam).toHaveBeenNthCalledWith(
      1,
      aTeam.team,
      "A Team",
      undefined,
    );
    expect(mockedSummarizeTeam).toHaveBeenNthCalledWith(
      2,
      bTeam.team,
      "B Team",
      undefined,
    );
  });

  it("swaps aTeam/bTeam order when sub matches bTeam's owner", async () => {
    const aTeam = buildSide({ owner: "auth0|a", teamName: "A Team" });
    const bTeam = buildSide({ owner: "auth0|b", teamName: "B Team" });
    const matchup = buildMatchup({ aTeam, bTeam });

    await matchup.analyze("auth0|b");

    expect(mockedSummarizeTeam).toHaveBeenNthCalledWith(
      1,
      bTeam.team,
      "B Team",
      undefined,
    );
    expect(mockedSummarizeTeam).toHaveBeenNthCalledWith(
      2,
      aTeam.team,
      "A Team",
      undefined,
    );
  });

  it("keeps aTeam as the perspective team when sub matches neither owner", async () => {
    const aTeam = buildSide({ owner: "auth0|a", teamName: "A Team" });
    const bTeam = buildSide({ owner: "auth0|b", teamName: "B Team" });
    const matchup = buildMatchup({ aTeam, bTeam });

    await matchup.analyze("auth0|stranger");

    expect(mockedSummarizeTeam).toHaveBeenNthCalledWith(
      1,
      aTeam.team,
      "A Team",
      undefined,
    );
  });

  it("keeps aTeam as the perspective team when no sub is provided and owners are unset", async () => {
    const aTeam = buildSide({ owner: undefined, teamName: "A Team" });
    const bTeam = buildSide({ owner: undefined, teamName: "B Team" });
    const matchup = buildMatchup({ aTeam, bTeam });

    await matchup.analyze();

    expect(mockedSummarizeTeam).toHaveBeenNthCalledWith(
      1,
      aTeam.team,
      "A Team",
      undefined,
    );
  });

  it("includes the requesting owner's notes and omits the other side's", async () => {
    const aTeam = buildSide({ owner: "auth0|a", notes: "a-notes" });
    const bTeam = buildSide({ owner: "auth0|b", notes: "b-notes" });
    const matchup = buildMatchup({ aTeam, bTeam });

    const aResult = await matchup.analyze("auth0|a");
    expect(aResult.notes).toBe("a-notes");
    expect(aResult.canEditNotes).toBe(true);

    const bResult = await matchup.analyze("auth0|b");
    expect(bResult.notes).toBe("b-notes");
    expect(bResult.canEditNotes).toBe(true);
  });

  it("omits notes when no sub is provided", async () => {
    const matchup = buildMatchup();

    const result = await matchup.analyze();

    expect(result.notes).toBeUndefined();
    expect(result.canEditNotes).toBe(false);
  });

  it("gives a viewer who owns neither side no notes to edit", async () => {
    const matchup = buildMatchup({
      aTeam: buildSide({ owner: "auth0|a", notes: "a-notes" }),
      bTeam: buildSide({ owner: "auth0|b", notes: "b-notes" }),
    });

    const result = await matchup.analyze("auth0|stranger");

    expect(result.notes).toBeUndefined();
    expect(result.canEditNotes).toBe(false);
  });

  it("assembles details from the format, ruleset, and tournament metadata", async () => {
    const matchup = buildMatchup({ stage: "Round 1", tournamentName: "Spring Cup" });

    const result = await matchup.analyze();

    expect(result.details).toEqual({
      level: FORMAT.level,
      format: FORMAT.name,
      ruleset: RULESET.name,
      leagueName: "Spring Cup",
      stage: "Round 1",
    });
  });
});

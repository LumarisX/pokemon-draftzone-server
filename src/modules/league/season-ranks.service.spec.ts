import { LeagueMatchupRepository } from "@modules/matchup/sub-modules/league-matchup/league-matchup.repository";
import { Types } from "mongoose";
import { SeasonRanksService } from "./season-ranks.service";

function buildTournament(overrides: Record<string, unknown> = {}): any {
  return {
    id: new Types.ObjectId().toString(),
    stages: [{ _id: new Types.ObjectId() }],
    rounds: [{ _id: new Types.ObjectId(), name: "Round 1" }],
    forfeit: { gameDiff: 3, pokemonDiff: 6 },
    diffMode: "pokemon",
    ...overrides,
  };
}

function buildMatchup(
  tournament: any,
  side1: Types.ObjectId,
  side2: Types.ObjectId,
  winner?: "side1" | "side2",
): any {
  return {
    stage: tournament.stages[0]._id,
    round: tournament.rounds[0]._id,
    winner,
    forfeit: false,
    side1: { team: side1, score: winner === "side1" ? 2 : 0 },
    side2: { team: side2, score: winner === "side2" ? 2 : 0 },
    results: winner
      ? [
          {
            winner,
            side1: { score: winner === "side1" ? 3 : 0 },
            side2: { score: winner === "side2" ? 3 : 0 },
          },
        ]
      : [],
  };
}

describe("SeasonRanksService", () => {
  let repo: jest.Mocked<LeagueMatchupRepository>;
  let service: SeasonRanksService;
  const winnerId = new Types.ObjectId();
  const loserId = new Types.ObjectId();

  function stamp(tournament: any, count: number, latest: string) {
    repo.fingerprintsByStages.mockResolvedValue([
      {
        stageId: tournament.stages[0]._id.toString(),
        count,
        latest: new Date(latest),
      },
    ]);
  }

  beforeEach(() => {
    repo = {
      fingerprintsByStages: jest.fn().mockResolvedValue([]),
      findSeasonByStages: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<LeagueMatchupRepository>;
    service = new SeasonRanksService(repo);
  });

  it("asks for nothing when there are no tournaments", async () => {
    await expect(service.ranks([])).resolves.toEqual(new Map());
    expect(repo.fingerprintsByStages).not.toHaveBeenCalled();
  });

  it("ranks every team in the tournament", async () => {
    const tournament = buildTournament();
    stamp(tournament, 1, "2026-11-01");
    repo.findSeasonByStages.mockResolvedValue([
      buildMatchup(tournament, winnerId, loserId, "side1"),
    ] as never);

    const ranks = (await service.ranks([tournament])).get(tournament.id);

    expect(ranks?.get(winnerId.toString())).toEqual({ rank: 1, of: 2 });
    expect(ranks?.get(loserId.toString())).toEqual({ rank: 2, of: 2 });
  });

  it("has no ranks before any match has a winner", async () => {
    const tournament = buildTournament();
    stamp(tournament, 1, "2026-11-01");
    repo.findSeasonByStages.mockResolvedValue([
      buildMatchup(tournament, winnerId, loserId),
    ] as never);

    const ranks = (await service.ranks([tournament])).get(tournament.id);

    expect(ranks?.size).toBe(0);
  });

  it("reuses stored ranks while no matchup has changed", async () => {
    const tournament = buildTournament();
    stamp(tournament, 1, "2026-11-01");
    repo.findSeasonByStages.mockResolvedValue([
      buildMatchup(tournament, winnerId, loserId, "side1"),
    ] as never);

    await service.ranks([tournament]);
    const again = (await service.ranks([tournament])).get(tournament.id);

    expect(repo.findSeasonByStages).toHaveBeenCalledTimes(1);
    expect(again?.get(winnerId.toString())).toEqual({ rank: 1, of: 2 });
  });

  it("recomputes when a matchup was saved", async () => {
    const tournament = buildTournament();
    stamp(tournament, 1, "2026-11-01");
    repo.findSeasonByStages.mockResolvedValue([
      buildMatchup(tournament, winnerId, loserId, "side1"),
    ] as never);
    await service.ranks([tournament]);

    stamp(tournament, 1, "2026-11-02");
    repo.findSeasonByStages.mockResolvedValue([
      buildMatchup(tournament, winnerId, loserId, "side2"),
    ] as never);
    const ranks = (await service.ranks([tournament])).get(tournament.id);

    expect(repo.findSeasonByStages).toHaveBeenCalledTimes(2);
    expect(ranks?.get(loserId.toString())).toEqual({ rank: 1, of: 2 });
  });

  it("recomputes when a matchup was added or removed", async () => {
    const tournament = buildTournament();
    stamp(tournament, 1, "2026-11-01");
    await service.ranks([tournament]);

    stamp(tournament, 2, "2026-11-01");
    await service.ranks([tournament]);

    expect(repo.findSeasonByStages).toHaveBeenCalledTimes(2);
  });

  it("recomputes when the scoring rules change", async () => {
    const tournament = buildTournament();
    stamp(tournament, 1, "2026-11-01");
    await service.ranks([tournament]);

    await service.ranks([{ ...tournament, diffMode: "game" }]);

    expect(repo.findSeasonByStages).toHaveBeenCalledTimes(2);
  });

  it("loads only the tournaments that changed, in one query", async () => {
    const steady = buildTournament();
    const moving = buildTournament();
    const stamps = (latest: string) => [
      { stageId: steady.stages[0]._id.toString(), count: 1, latest: new Date("2026-11-01") },
      { stageId: moving.stages[0]._id.toString(), count: 1, latest: new Date(latest) },
    ];
    repo.fingerprintsByStages.mockResolvedValue(stamps("2026-11-01"));
    await service.ranks([steady, moving]);

    repo.fingerprintsByStages.mockResolvedValue(stamps("2026-11-05"));
    await service.ranks([steady, moving]);

    expect(repo.findSeasonByStages).toHaveBeenCalledTimes(2);
    expect(repo.findSeasonByStages).toHaveBeenLastCalledWith([
      moving.stages[0]._id,
    ]);
  });

  it("leaves hidden stages out of the ranking", async () => {
    const hidden = new Types.ObjectId();
    const tournament = buildTournament();
    tournament.stages.push({ _id: hidden, public: false });

    await service.ranks([tournament]);

    expect(repo.fingerprintsByStages).toHaveBeenCalledWith([
      tournament.stages[0]._id,
    ]);
  });
});

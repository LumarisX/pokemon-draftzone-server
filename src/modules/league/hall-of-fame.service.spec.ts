import { Types } from "mongoose";
import { HallOfFameService } from "./hall-of-fame.service";

describe("HallOfFameService", () => {
  const stage = {
    _id: new Types.ObjectId(),
    type: "round-robin",
    teamIds: [],
  };

  function build() {
    const tournament = {
      id: "t1",
      slug: "spring-cup",
      name: "Spring Cup",
      stages: [stage],
      trades: [],
      rounds: [],
      forfeit: { gameDiff: 0 },
      effectiveStandingsRules: () => [],
    };
    const fingerprint = { latest: new Date("2026-11-01T00:00:00Z"), count: 3 };
    const matchupRepo = {
      fingerprintsByStages: jest.fn(async () => [
        { stageId: stage._id.toString(), ...fingerprint },
      ]),
      findByStages: jest.fn().mockResolvedValue([]),
      findAdvancementFieldsByStages: jest.fn().mockResolvedValue([]),
    };
    const service = new HallOfFameService(
      {
        findBySlug: jest.fn().mockResolvedValue({ name: "PDZ", slug: "pdz" }),
      } as never,
      { findAllByLeague: jest.fn().mockResolvedValue([tournament]) } as never,
      {
        findAllByTournament: jest.fn().mockResolvedValue([]),
        findManyByIds: jest.fn().mockResolvedValue([]),
      } as never,
      {
        findAllByTournament: jest.fn().mockResolvedValue([stage]),
        teamIdsInSeedOrder: jest.fn().mockReturnValue([]),
      } as never,
      matchupRepo as never,
    );
    return { service, matchupRepo, fingerprint, tournament };
  }

  it("reuses a running season's achievements until its matchups change", async () => {
    const { service, matchupRepo, fingerprint } = build();

    await service.getHallOfFame("pdz");
    await service.getHallOfFame("pdz");
    expect(matchupRepo.findByStages).toHaveBeenCalledTimes(1);

    fingerprint.latest = new Date("2026-11-02T00:00:00Z");
    await service.getHallOfFame("pdz");
    expect(matchupRepo.findByStages).toHaveBeenCalledTimes(2);
  });

  it("recomputes when a trade is approved", async () => {
    const { service, matchupRepo, tournament } = build();

    await service.getHallOfFame("pdz");
    (tournament.trades as unknown[]).push({
      _id: new Types.ObjectId(),
      status: "APPROVED",
    });
    await service.getHallOfFame("pdz");

    expect(matchupRepo.findByStages).toHaveBeenCalledTimes(2);
  });
});

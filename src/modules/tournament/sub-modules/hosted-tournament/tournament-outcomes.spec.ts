import { Types } from "mongoose";
import { computeTournamentOutcomes } from "./tournament-outcomes";

describe("computeTournamentOutcomes", () => {
  const visible = { _id: new Types.ObjectId(), type: "round-robin" };
  const hidden = {
    _id: new Types.ObjectId(),
    type: "single-elimination",
    public: false,
  };

  function repos() {
    return {
      stageRepo: {
        findAllByTournament: jest.fn().mockResolvedValue([visible, hidden]),
        teamIdsInSeedOrder: jest.fn().mockReturnValue([]),
      },
      teamRepo: { findManyByIds: jest.fn().mockResolvedValue([]) },
      matchupRepo: {
        findByStages: jest.fn().mockResolvedValue([]),
        findAdvancementFieldsByStages: jest.fn().mockResolvedValue([]),
      },
    };
  }

  const tournament = {
    id: "t1",
    trades: [],
    rounds: [],
    forfeit: { gameDiff: 0 },
    effectiveStandingsRules: () => [],
  } as any;

  it("reads every stage for the organizers' final results", async () => {
    const r = repos();

    await computeTournamentOutcomes(r as any, tournament);

    expect(r.matchupRepo.findByStages).toHaveBeenCalledWith([
      visible._id,
      hidden._id,
    ]);
  });

  it("loads the teams once across every stage, in seed order", async () => {
    const r = repos();
    const [a, b, c] = [1, 2, 3].map(() => new Types.ObjectId());
    r.stageRepo.teamIdsInSeedOrder
      .mockReturnValueOnce([b, a])
      .mockReturnValueOnce([a, c]);

    await computeTournamentOutcomes(r as any, tournament);

    expect(r.teamRepo.findManyByIds).toHaveBeenCalledTimes(1);
    expect(r.teamRepo.findManyByIds).toHaveBeenCalledWith([b, a, c]);
  });

  it("leaves hidden stages out of what the public sees", async () => {
    const r = repos();

    await computeTournamentOutcomes(r as any, tournament, { publicOnly: true });

    expect(r.matchupRepo.findByStages).toHaveBeenCalledWith([visible._id]);
    expect(r.matchupRepo.findAdvancementFieldsByStages).toHaveBeenCalledWith(
      [],
    );
  });
});

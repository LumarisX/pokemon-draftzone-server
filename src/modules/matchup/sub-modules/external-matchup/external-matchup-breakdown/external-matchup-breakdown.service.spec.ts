import { Types } from "mongoose";
import { ExternalMatchupRepository } from "../external-matchup.repository";
import { ExternalMatchupBreakdownService } from "./external-matchup-breakdown.service";

function setup() {
  const matchupRepo = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<ExternalMatchupRepository>;
  const service = new ExternalMatchupBreakdownService(matchupRepo);
  return { matchupRepo, service };
}

describe("ExternalMatchupBreakdownService", () => {
  it("forwards getMatchupById to the repository", async () => {
    const { matchupRepo, service } = setup();
    const matchupId = new Types.ObjectId();
    const matchup = { id: matchupId, aTeam: {}, bTeam: {} } as any;
    matchupRepo.findById.mockResolvedValue(matchup);

    const result = await service.getMatchupById(matchupId);

    expect(matchupRepo.findById).toHaveBeenCalledWith(matchupId);
    expect(result).toBe(matchup);
  });

  it("does not fall back to the owner's username for a side's coach", async () => {
    const { matchupRepo, service } = setup();
    const matchup = {
      aTeam: { owner: "auth0|coach-1" },
      bTeam: {},
    } as any;
    matchupRepo.findById.mockResolvedValue(matchup);

    const result = await service.getMatchupById(new Types.ObjectId());

    expect(result.aTeam.coach).toBeUndefined();
  });

  it("keeps an explicitly entered coach", async () => {
    const { matchupRepo, service } = setup();
    const matchup = {
      aTeam: { owner: "auth0|coach-1" },
      bTeam: { coach: "Entered Name" },
    } as any;
    matchupRepo.findById.mockResolvedValue(matchup);

    const result = await service.getMatchupById(new Types.ObjectId());

    expect(result.bTeam.coach).toBe("Entered Name");
  });
});

import { Types } from "mongoose";
import { ExternalMatchupRepository } from "../external-matchup.repository";
import { ExternalMatchupBreakdownService } from "./external-matchup-breakdown.service";

describe("ExternalMatchupBreakdownService", () => {
  it("forwards getMatchupById to the repository", async () => {
    const matchupRepo = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<ExternalMatchupRepository>;
    const service = new ExternalMatchupBreakdownService(matchupRepo);
    const matchupId = new Types.ObjectId();
    const matchup = { id: matchupId } as any;
    matchupRepo.findById.mockResolvedValue(matchup);

    const result = await service.getMatchupById(matchupId);

    expect(matchupRepo.findById).toHaveBeenCalledWith(matchupId);
    expect(result).toBe(matchup);
  });
});

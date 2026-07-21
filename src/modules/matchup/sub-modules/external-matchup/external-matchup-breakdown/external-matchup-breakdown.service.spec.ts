import { Types } from "mongoose";
import { UserService } from "@modules/user/user.service";
import { ExternalMatchupRepository } from "../external-matchup.repository";
import { ExternalMatchupBreakdownService } from "./external-matchup-breakdown.service";

function setup() {
  const matchupRepo = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<ExternalMatchupRepository>;
  const userService = {
    getUsername: jest.fn(),
  } as unknown as jest.Mocked<UserService>;
  const service = new ExternalMatchupBreakdownService(matchupRepo, userService);
  return { matchupRepo, userService, service };
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

  it("fills a side's coach from the user index using its owner", async () => {
    const { matchupRepo, userService, service } = setup();
    const matchup = {
      aTeam: { owner: "auth0|coach-1" },
      bTeam: {},
    } as any;
    matchupRepo.findById.mockResolvedValue(matchup);
    userService.getUsername.mockResolvedValue("Ash");

    const result = await service.getMatchupById(new Types.ObjectId());

    expect(userService.getUsername).toHaveBeenCalledWith("auth0|coach-1");
    expect(result.aTeam.coach).toBe("Ash");
  });

  it("keeps an explicitly entered coach over the owner's username", async () => {
    const { matchupRepo, userService, service } = setup();
    const matchup = {
      aTeam: { owner: "auth0|coach-1", coach: "Entered Name" },
      bTeam: {},
    } as any;
    matchupRepo.findById.mockResolvedValue(matchup);

    const result = await service.getMatchupById(new Types.ObjectId());

    expect(userService.getUsername).not.toHaveBeenCalled();
    expect(result.aTeam.coach).toBe("Entered Name");
  });

  it("leaves the coach unset when the owner has no known username", async () => {
    const { matchupRepo, userService, service } = setup();
    const matchup = { aTeam: { owner: "auth0|ghost" }, bTeam: {} } as any;
    matchupRepo.findById.mockResolvedValue(matchup);
    userService.getUsername.mockResolvedValue(undefined);

    const result = await service.getMatchupById(new Types.ObjectId());

    expect(result.aTeam.coach).toBeUndefined();
  });
});

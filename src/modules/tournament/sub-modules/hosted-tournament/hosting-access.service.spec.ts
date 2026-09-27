import { LeagueRepository } from "@modules/league/league.repository";
import { UserRole } from "@modules/user/user.schema";
import { UserService } from "@modules/user/user.service";
import { ConfigService } from "@nestjs/config";
import { Types } from "mongoose";
import { HostedTournamentRepository } from "./hosted-tournament.repository";
import { HostingAccessService } from "./hosting-access.service";

describe("HostingAccessService", () => {
  const leagueIds = [new Types.ObjectId(), new Types.ObjectId()];
  let roles: UserRole[];
  let env: Record<string, string | undefined>;
  let activeCount: number;
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let service: HostingAccessService;

  beforeEach(() => {
    roles = [UserRole.TOURNAMENT_CREATOR];
    env = {};
    activeCount = 0;
    tournamentRepo = {
      countActiveInLeagues: jest.fn(async () => activeCount),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    service = new HostingAccessService(
      { getMe: jest.fn(async () => ({ roles })) } as unknown as UserService,
      { get: (key: string) => env[key] } as unknown as ConfigService,
      {
        findByOwner: jest
          .fn()
          .mockResolvedValue(leagueIds.map((_id) => ({ _id }))),
      } as unknown as LeagueRepository,
      tournamentRepo,
    );
  });

  it("counts active tournaments across every league the user owns", async () => {
    await service.access("auth0|host");

    expect(tournamentRepo.countActiveInLeagues).toHaveBeenCalledWith(leagueIds);
  });

  it("refuses league creation without the tournament-creator role", async () => {
    roles = [];

    await expect(
      service.assertCanCreateLeague("auth0|host"),
    ).rejects.toMatchObject({ code: "LR-002" });
  });

  it("lets a host create leagues no matter how many tournaments they run", async () => {
    activeCount = 50;

    await expect(
      service.assertCanCreateLeague("auth0|host"),
    ).resolves.toBeUndefined();
  });

  it("refuses a tournament without the role", async () => {
    roles = [];

    await expect(
      service.assertCanCreateTournament("auth0|host"),
    ).rejects.toMatchObject({ code: "TRN-022" });
  });

  it("refuses a tournament past the active cap", async () => {
    env.MAX_ACTIVE_TOURNAMENTS = "2";
    activeCount = 2;

    await expect(
      service.assertCanCreateTournament("auth0|host"),
    ).rejects.toMatchObject({ code: "TRN-023" });
  });

  it("still reports a capped host as able to host", async () => {
    activeCount = 3;

    await expect(service.access("auth0|host")).resolves.toEqual({
      canHost: true,
      tournament: { allowed: false, reason: "limit" },
    });
  });
});

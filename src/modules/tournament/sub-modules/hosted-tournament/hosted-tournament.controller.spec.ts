import { HostedTournamentController } from "./hosted-tournament.controller";
import { HostedTournamentService } from "./hosted-tournament.service";

describe("HostedTournamentController signup routes", () => {
  let service: jest.Mocked<HostedTournamentService>;
  let controller: HostedTournamentController;

  beforeEach(() => {
    service = {
      getSignup: jest.fn(),
      createSignup: jest.fn(),
    } as unknown as jest.Mocked<HostedTournamentService>;
    controller = new HostedTournamentController(service);
  });

  it("getTournamentSignup forwards the league key, tournament key, and authenticated sub", async () => {
    const signup = { teamName: "Team Rocket" };
    service.getSignup.mockResolvedValue(signup as any);

    const result = await controller.getTournamentSignup(
      "spring-league",
      "spring-cup",
      "auth0|coach-1",
    );

    expect(service.getSignup).toHaveBeenCalledWith(
      "spring-league",
      "spring-cup",
      "auth0|coach-1",
    );
    expect(result).toBe(signup);
  });

  it("createTournamentSignup forwards the league key, tournament key, sub, and body", async () => {
    const body = {
      name: "Ash Ketchum",
      gameName: "AshK",
      discordName: "ash#1234",
      teamName: "Team Rocket",
      timezone: "America/Los_Angeles",
      experience: "5 years",
      droppedBefore: false,
      droppedWhy: "",
      confirm: true,
    };
    const response = { message: "Sign up successful." };
    service.createSignup.mockResolvedValue(response as any);

    const result = await controller.createTournamentSignup(
      "spring-league",
      "spring-cup",
      "auth0|coach-1",
      body as any,
    );

    expect(service.createSignup).toHaveBeenCalledWith(
      "spring-league",
      "spring-cup",
      "auth0|coach-1",
      body,
    );
    expect(result).toBe(response);
  });
});

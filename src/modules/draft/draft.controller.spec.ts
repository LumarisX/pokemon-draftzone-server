// The real `agenda` package is ESM-only and breaks Jest's CJS transform.
// draft.controller.ts -> draft.service.ts -> draft-engine.service.ts ->
// agenda.service.ts transitively imports it (only for types/decorator
// metadata), so it must be mocked before loading the SUT.
jest.mock("agenda", () => ({}));

import { DraftController } from "./draft.controller";
import { DraftPickDto, SetDraftStateDto, SetPicksDto } from "./draft.dto";
import { DraftService } from "./draft.service";

describe("DraftController", () => {
  let service: jest.Mocked<DraftService>;
  let controller: DraftController;

  beforeEach(() => {
    service = {
      getDetails: jest.fn(),
      getTeams: jest.fn(),
      getPicks: jest.fn(),
      getOrder: jest.fn(),
      getPowerRankings: jest.fn(),
      getPokemonList: jest.fn(),
      draftPick: jest.fn(),
      setPicks: jest.fn(),
      setState: jest.fn(),
      skipPick: jest.fn(),
    } as unknown as jest.Mocked<DraftService>;
    controller = new DraftController(service);
  });

  it("getDetails forwards leagueKey/tournamentKey/draftKey/sub", async () => {
    const details = { draftName: "Spring Draft" } as any;
    service.getDetails.mockResolvedValue(details);

    const result = await controller.getDetails("league-1", "tournament-1", "draft-1", "auth0|sub");

    expect(service.getDetails).toHaveBeenCalledWith(
      "league-1", "tournament-1", "draft-1", "auth0|sub",
    );
    expect(result).toBe(details);
  });

  it("getTeams forwards leagueKey/tournamentKey/draftKey/sub/stageId", async () => {
    const teams = { teams: [] } as any;
    service.getTeams.mockResolvedValue(teams);

    const result = await controller.getTeams(
      "league-1", "tournament-1", "draft-1", "auth0|sub", "stage-1",
    );

    expect(service.getTeams).toHaveBeenCalledWith(
      "league-1", "tournament-1", "draft-1", "auth0|sub", "stage-1",
    );
    expect(result).toBe(teams);
  });

  it("getPicks forwards leagueKey/tournamentKey/draftKey", async () => {
    const picks = [] as any;
    service.getPicks.mockResolvedValue(picks);

    const result = await controller.getPicks("league-1", "tournament-1", "draft-1");

    expect(service.getPicks).toHaveBeenCalledWith("league-1", "tournament-1", "draft-1");
    expect(result).toBe(picks);
  });

  it("getOrder forwards leagueKey/tournamentKey/draftKey", async () => {
    const order = [] as any;
    service.getOrder.mockResolvedValue(order);

    const result = await controller.getOrder("league-1", "tournament-1", "draft-1");

    expect(service.getOrder).toHaveBeenCalledWith("league-1", "tournament-1", "draft-1");
    expect(result).toBe(order);
  });

  it("getPowerRankings forwards leagueKey/tournamentKey/draftKey", async () => {
    const rankings = [] as any;
    service.getPowerRankings.mockResolvedValue(rankings);

    const result = await controller.getPowerRankings("league-1", "tournament-1", "draft-1");

    expect(service.getPowerRankings).toHaveBeenCalledWith(
      "league-1", "tournament-1", "draft-1",
    );
    expect(result).toBe(rankings);
  });

  it("getPokemonList forwards leagueKey/tournamentKey/draftKey/sub/stageId", async () => {
    const list = { groups: [] } as any;
    service.getPokemonList.mockResolvedValue(list);

    const result = await controller.getPokemonList(
      "league-1", "tournament-1", "draft-1", "auth0|sub", "stage-1",
    );

    expect(service.getPokemonList).toHaveBeenCalledWith(
      "league-1", "tournament-1", "draft-1", "auth0|sub", "stage-1",
    );
    expect(result).toBe(list);
  });

  it("draftPick forwards leagueKey/tournamentKey/draftKey/teamId/sub/body", async () => {
    const response = { message: "Drafted successfully." };
    service.draftPick.mockResolvedValue(response);
    const body = { pokemonId: "pikachu" } as DraftPickDto;

    const result = await controller.draftPick(
      "league-1", "tournament-1", "draft-1", "team-1", "auth0|sub", body,
    );

    expect(service.draftPick).toHaveBeenCalledWith(
      "league-1", "tournament-1", "draft-1", "team-1", "auth0|sub", body,
    );
    expect(result).toBe(response);
  });

  it("setPicks forwards leagueKey/tournamentKey/draftKey/teamId/sub/body", async () => {
    const response = { message: "Draft pick set successfully." };
    service.setPicks.mockResolvedValue(response);
    const body = { picks: [] } as SetPicksDto;

    const result = await controller.setPicks(
      "league-1", "tournament-1", "draft-1", "team-1", "auth0|sub", body,
    );

    expect(service.setPicks).toHaveBeenCalledWith(
      "league-1", "tournament-1", "draft-1", "team-1", "auth0|sub", body,
    );
    expect(result).toBe(response);
  });

  it("setState forwards leagueKey/tournamentKey/draftKey/sub/body", async () => {
    const response = { message: "Timer set successfully." };
    service.setState.mockResolvedValue(response);
    const body = { state: "play" } as SetDraftStateDto;

    const result = await controller.setState(
      "league-1", "tournament-1", "draft-1", "auth0|sub", body,
    );

    expect(service.setState).toHaveBeenCalledWith(
      "league-1", "tournament-1", "draft-1", "auth0|sub", body,
    );
    expect(result).toBe(response);
  });

  it("skipPick forwards leagueKey/tournamentKey/draftKey/sub", async () => {
    const response = { message: "Skip successful." };
    service.skipPick.mockResolvedValue(response);

    const result = await controller.skipPick("league-1", "tournament-1", "draft-1", "auth0|sub");

    expect(service.skipPick).toHaveBeenCalledWith(
      "league-1", "tournament-1", "draft-1", "auth0|sub",
    );
    expect(result).toBe(response);
  });
});

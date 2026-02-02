import {
  generatePickOrder,
  buildDraftBoards,
  calculateCanDraft,
  calculateCurrentPick,
  isCoach,
  getCurrentRound,
  getCurrentPositionInRound,
  getCurrentPickingTeam,
  canTeamDraft,
  isAlreadyDrafted,
  getTeamPoints,
  teamHasEnoughPoints,
  canBeDrafted,
  currentTeamPicks,
  draftPokemon,
  isTeamDoneDrafting,
  increaseCounter,
  checkCounterIncrease,
  getDivisionDetails,
  skipCurrentPick,
  cancelSkipTime,
  setDivsionState,
} from "./draft-service";

jest.mock("./tier-service", () => ({
  getPokemonTier: jest.fn().mockResolvedValue("10"),
}));

jest.mock("../../agenda", () => ({
  scheduleSkipPick: jest.fn(),
  cancelSkipPick: jest.fn(),
  resumeSkipPick: jest.fn(),
}));

jest.mock("../../discord", () => ({
  sendDiscordMessage: jest.fn(),
}));

jest.mock("../data-services/pokedex.service", () => ({
  getName: jest.fn().mockReturnValue("Pokemon"),
}));

describe("draft-service", () => {
  describe("generatePickOrder", () => {
    const teams = [
      { id: "team1", name: "Team 1" },
      { id: "team2", name: "Team 2" },
      { id: "team3", name: "Team 3" },
    ] as any;

    it("should generate a linear pick order", () => {
      const pickOrder = generatePickOrder(teams, 2, "linear");
      expect(pickOrder.map((t) => t.id)).toEqual([
        "team1",
        "team2",
        "team3",
        "team1",
        "team2",
        "team3",
      ]);
    });

    it("should generate a snake pick order", () => {
      const pickOrder = generatePickOrder(teams, 2, "snake");
      expect(pickOrder.map((t) => t.id)).toEqual([
        "team1",
        "team2",
        "team3",
        "team3",
        "team2",
        "team1",
      ]);
    });
  });

  describe("buildDraftBoards", () => {
    const teams = [
      { id: "team1", name: "Team 1", draft: [{ pokemonId: "p1" }] },
      { id: "team2", name: "Team 2", draft: [{ pokemonId: "p2" }] },
    ] as any;
    const division = { teams } as any;
    const pickOrder = [teams[0], teams[1], teams[1], teams[0]];

    it("should build flat and round draft boards", () => {
      const { flatDraftBoard, draftRounds } = buildDraftBoards(
        division,
        pickOrder,
      );
      expect(flatDraftBoard.map((p) => p.pokemon?.id)).toEqual([
        "p1",
        "p2",
        undefined,
        undefined,
      ]);
      expect(draftRounds.length).toBe(2);
      expect(draftRounds[0].map((p) => p.pokemon?.id)).toEqual(["p1", "p2"]);
      expect(draftRounds[1].map((p) => p.pokemon?.id)).toEqual([
        undefined,
        undefined,
      ]);
    });
  });

  describe("calculateCanDraft", () => {
    const teams = [
      { id: "team1", name: "Team 1", draft: [] },
      { id: "team2", name: "Team 2", draft: [] },
    ] as any;
    const pickOrder = [teams[0], teams[1], teams[0], teams[1]];

    it("should return empty array if draft is not in progress", () => {
      const division = {
        teams,
        status: "DRAFT_COMPLETE",
        draftCounter: 0,
      } as any;
      const canDraft = calculateCanDraft(division, pickOrder);
      expect(canDraft).toEqual([]);
    });

    it("should return the current picking team", () => {
      const division = { teams, status: "IN_PROGRESS", draftCounter: 0 } as any;
      const canDraft = calculateCanDraft(division, pickOrder);
      expect(canDraft).toEqual(["team1"]);
    });

    it("should return teams that have missed picks", () => {
      const division = {
        teams: [
          { id: "team1", name: "Team 1", draft: [] },
          { id: "team2", name: "Team 2", draft: [] },
        ],
        status: "IN_PROGRESS",
        draftCounter: 2,
      } as any;
      const canDraft = calculateCanDraft(division, pickOrder);
      expect(canDraft).toEqual(["team1", "team2"]);
    });
  });

  describe("calculateCurrentPick", () => {
    const division = {
      draftCounter: 3,
      teams: { length: 2 },
      skipTime: new Date(),
    } as any;

    it("should calculate the current pick and round", () => {
      const currentPick = calculateCurrentPick(division);
      expect(currentPick.round).toBe(1);
      expect(currentPick.position).toBe(1);
      expect(currentPick.skipTime).toBe(division.skipTime);
    });
  });

  describe("isCoach", () => {
    it("should return true if the user is a coach of the team", async () => {
      const team = {
        coach: { auth0Id: "user1" },
        populate: jest.fn().mockReturnThis(),
      } as any;
      const result = await isCoach(team, "user1");
      expect(result).toBe(true);
    });

    it("should return false if the user is not a coach of the team", async () => {
      const team = {
        coach: { auth0Id: "user2" },
        populate: jest.fn().mockReturnThis(),
      } as any;
      const result = await isCoach(team, "user1");
      expect(result).toBe(false);
    });
  });

  describe("getCurrentRound", () => {
    it("should calculate the current round", () => {
      const division = { draftCounter: 3, teams: { length: 2 } } as any;
      const round = getCurrentRound(division);
      expect(round).toBe(1);
    });
  });

  describe("getCurrentPositionInRound", () => {
    it("should calculate the current position in the round", () => {
      const division = { draftCounter: 3, teams: { length: 2 } } as any;
      const position = getCurrentPositionInRound(division);
      expect(position).toBe(1);
    });
  });

  describe("getCurrentPickingTeam", () => {
    const teams = [
      { id: "team1", name: "Team 1" },
      { id: "team2", name: "Team 2" },
    ] as any;

    it("should return the correct picking team in a linear draft", () => {
      const division = { draftCounter: 1, teams, draftStyle: "linear" } as any;
      const pickingTeam = getCurrentPickingTeam(division);
      expect(pickingTeam.id).toBe("team2");
    });

    it("should return the correct picking team in a snake draft", () => {
      const division = { draftCounter: 2, teams, draftStyle: "snake" } as any;
      const pickingTeam = getCurrentPickingTeam(division);
      expect(pickingTeam.id).toBe("team2");
    });
  });

  describe("canTeamDraft", () => {
    const teams = [
      {
        _id: { equals: (id: string) => id === "team1" },
        id: "team1",
        name: "Team 1",
        draft: [],
      },
      {
        _id: { equals: (id: string) => id === "team2" },
        id: "team2",
        name: "Team 2",
        draft: [],
      },
    ] as any;

    it("should return true if the team can draft", async () => {
      const division = { draftCounter: 0, teams, draftStyle: "linear" } as any;
      const result = await canTeamDraft(division, teams[0]);
      expect(result).toBe(true);
    });

    it("should return false if the team cannot draft", async () => {
      const division = { draftCounter: 1, teams, draftStyle: "linear" } as any;
      const result = await canTeamDraft(division, teams[0]);
      expect(result).toBe(false);
    });
  });

  describe("isAlreadyDrafted", () => {
    const division = {
      teams: [
        { draft: [{ pokemonId: "p1" }] },
        { draft: [{ pokemonId: "p2" }] },
      ],
    } as any;

    it("should return true if the pokemon is already drafted", () => {
      const result = isAlreadyDrafted(division, "p1");
      expect(result).toBe(true);
    });

    it("should return false if the pokemon is not already drafted", () => {
      const result = isAlreadyDrafted(division, "p3");
      expect(result).toBe(false);
    });
  });

  describe("getTeamPoints", () => {
    it("should calculate the total points of a team", async () => {
      const league = {} as any;
      const team = { draft: [{ pokemonId: "p1" }, { pokemonId: "p2" }] } as any;

      const points = await getTeamPoints(league, team);
      expect(points).toBe(20);
    });
  });

  describe("teamHasEnoughPoints", () => {
    it("should return true if the team has enough points", async () => {
      const league = { tierList: { points: 100, draftCount: [1, 12] } } as any;
      const division = {} as any;
      const team = { draft: [] } as any;

      const result = await teamHasEnoughPoints(league, division, team, "p1");
      expect(result).toBe(true);
    });
  });

  describe("canBeDrafted", () => {
    it("should return true if the pokemon can be drafted", async () => {
      const league = { tierList: { points: 100, draftCount: [1, 12] } } as any;
      const division = { teams: [] } as any;
      const team = { draft: [] } as any;

      const result = await canBeDrafted(league, division, team, "p1");
      expect(result).toBe(true);
    });
  });

  describe("currentTeamPicks", () => {
    it("should return the current team picks", async () => {
      const league = { tierList: { points: 100, draftCount: [1, 12] } } as any;
      const division = { teams: [] } as any;
      const team = { picks: [["p1", "p2"]], save: jest.fn() } as any;

      const result = await currentTeamPicks(league, division, team);
      expect(result).toEqual(["p1", "p2"]);
    });
  });

  describe("draftPokemon", () => {
    it("should draft a pokemon", async () => {
      const league = {
        tournamentKey: "test",
        tierList: {
          points: 100,
          draftCount: [1, 12],
          tierGroups: [],
        },
        populate: jest.fn().mockReturnThis(),
      } as any;
      const team = {
        id: "team1",
        name: "Team 1",
        draft: [],
        picks: [],
        coaches: [{ _id: "coach1" }],
        save: jest.fn(),
        populate: jest.fn().mockReturnThis(),
        _id: { equals: (id: string) => id === "team1" },
      } as any;
      const division = {
        divisionKey: "test",
        teams: [team],
        draftCounter: 0,
        draftStyle: "linear",
        save: jest.fn(),
        populate: jest.fn().mockReturnThis(),
      } as any;
      const pokemonId = "p1";

      await draftPokemon(league, division, team, pokemonId);
      expect(team.draft[0].pokemonId).toBe(pokemonId);
    });
  });

  describe("isTeamDoneDrafting", () => {
    it("should return true if the team is done drafting", async () => {
      const league = {
        tierList: { draftCount: [1, 1], points: 100 },
        populate: jest.fn().mockReturnThis(),
      } as any;
      const division = {} as any;
      const team = { draft: [{ pokemonId: "p1" }] } as any;

      const result = await isTeamDoneDrafting(league, division, team);
      expect(result).toBe(true);
    });
  });

  describe("increaseCounter", () => {
    it("should increase the draft counter", async () => {
      const league = {
        tournamentKey: "test",
        tierList: { draftCount: [1, 12] },
        populate: jest.fn().mockReturnThis(),
      } as any;
      const division = {
        divisionKey: "test",
        draftCounter: 0,
        teams: [
          {
            id: "team1",
            name: "Team 1",
            draft: [],
            picks: [],
            coaches: [{ _id: "coach1" }],
            save: jest.fn(),
            populate: jest.fn().mockReturnThis(),
            _id: { equals: () => true, toString: () => "team1" },
          },
        ],
        draftStyle: "linear",
        save: jest.fn(),
        populate: jest.fn().mockReturnThis(),
      } as any;

      await increaseCounter(league, division);
      expect(division.draftCounter).toBe(1);
    });
  });

  describe("checkCounterIncrease", () => {
    it("should increase the counter if the current picking team has drafted", async () => {
      const league = {
        tournamentKey: "test",
        tierList: { draftCount: [1, 12] },
        populate: jest.fn().mockReturnThis(),
      } as any;
      const team = {
        _id: { equals: () => true, toString: () => "team1" },
        draft: [{ pokemonId: "p1" }],
        populate: jest.fn().mockReturnThis(),
        picks: [],
      } as any;
      const division = {
        draftCounter: 0,
        teams: [team],
        draftStyle: "linear",
        save: jest.fn(),
        populate: jest.fn().mockReturnThis(),
      } as any;

      await checkCounterIncrease(league, division, team);
      expect(division.draftCounter).toBe(1);
    });
  });

  describe("getDivisionDetails", () => {
    it("should return the division details", async () => {
      const league = {
        name: "league",
        tournamentKey: "test",
        tierList: {
          draftCount: [1, 12],
          points: 100,
          tierGroups: [],
        },
        populate: jest.fn().mockReturnThis(),
      } as any;
      const division = {
        name: "division",
        divisionKey: "test",
        draftCounter: 0,
        teams: [],
        draftStyle: "linear",
        skipTime: new Date(),
        status: "IN_PROGRESS",
        populate: jest.fn().mockReturnThis(),
      } as any;
      const userId = "user1";

      const result = await getDivisionDetails(league, division, userId);
      expect(result.leagueName).toBe("league");
      expect(result.divisionName).toBe("division");
    });
  });

  describe("skipCurrentPick", () => {
    it("should skip the current pick", async () => {
      const league = {
        tournamentKey: "test",
        tierList: { draftCount: [1, 12] },
        populate: jest.fn().mockReturnThis(),
      } as any;
      const team = {
        _id: { equals: () => true, toString: () => "team1" },
        draft: [],
        picks: [],
        populate: jest.fn().mockReturnThis(),
      } as any;
      const division = {
        draftCounter: 0,
        teams: [team],
        draftStyle: "linear",
        save: jest.fn(),
        populate: jest.fn().mockReturnThis(),
      } as any;

      await skipCurrentPick(league, division);
      expect(division.draftCounter).toBe(1);
    });
  });

  describe("cancelSkipTime", () => {
    it("should cancel the skip time", () => {
      const skipTime = new Date();
      skipTime.setSeconds(skipTime.getSeconds() + 60);
      const division = { skipTime } as any;

      cancelSkipTime(division);
      expect(division.remainingTime).toBeCloseTo(60, 0);
    });
  });

  describe("setDivsionState", () => {
    it("should set the division state to play", async () => {
      const league = { tournamentKey: "test" } as any;
      const division = {
        status: "PAUSED",
        timerLength: 60,
        save: jest.fn(),
        teams: [],
      } as any;

      await setDivsionState(league, division, "play");
      expect(division.status).toBe("IN_PROGRESS");
    });

    it("should set the division state to pause", async () => {
      const league = { tournamentKey: "test" } as any;
      const division = {
        status: "IN_PROGRESS",
        skipTime: new Date(),
        save: jest.fn(),
        teams: [],
      } as any;

      await setDivsionState(league, division, "pause");
      expect(division.status).toBe("PAUSED");
    });
  });
});

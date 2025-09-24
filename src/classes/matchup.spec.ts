import { ID } from "@pkmn/data";
import { Types } from "mongoose";
import { getFormat } from "../data/formats";
import { getRuleset } from "../data/rulesets";
import { MatchupData } from "../models/draft/matchup.model";
import * as draftService from "../services/database-services/draft.service";
import * as coverageService from "../services/matchup-services/coverage.service";
import * as movechartService from "../services/matchup-services/movechart.service";
import * as speedchartService from "../services/matchup-services/speedchart.service";
import { Draft } from "./draft";
import { GameTime, Matchup, Score } from "./matchup";
import { Opponent } from "./opponent";
import { PokemonFormData } from "./pokemon";

jest.mock("../services/database-services/draft.service");
jest.mock("../services/matchup-services/coverage.service");
jest.mock("../services/matchup-services/movechart.service");
jest.mock("../services/matchup-services/speedchart.service");

describe("Matchup", () => {
  const ruleset = getRuleset("Gen9 NatDex");
  const format = getFormat("Singles");

  const draftData = {
    leagueName: "Test league",
    teamName: "Team A",
    format: "Singles",
    ruleset: "Gen9 NatDex",
    team: [
      { id: "pikachu" as ID, name: "Pikachu" },
      { id: "charizard" as ID, name: "Charizard" },
    ] as PokemonFormData[],
  };

  const user_id = "test_user";

  const draft = Draft.fromForm(draftData, user_id, ruleset, format);
  draft._id = new Types.ObjectId();

  const opponentData = {
    teamName: "Team B",
    coach: "user-b",
    stage: "Week 1",
    team: [
      { id: "mewtwo" as ID, name: "Mewtwo" },
      { id: "mew" as ID, name: "Mew" },
    ] as PokemonFormData[],
    matches: [],
  };

  const opponent = Opponent.fromForm(opponentData, ruleset);
  opponent._id = new Types.ObjectId();

  it("should create a matchup from quick data", async () => {
    const data = {
      format: "Singles",
      ruleset: "Gen9 NatDex",
      side1: {
        team: [
          { id: "pikachu" as ID, name: "Pikachu" },
          { id: "charizard" as ID, name: "Charizard" },
        ],
        teamName: "Team 1",
      },
      side2: {
        team: [
          { id: "mewtwo" as ID, name: "Mewtwo" },
          { id: "mew" as ID, name: "Mew" },
        ],
        teamName: "Team 2",
      },
    };

    const matchup = await Matchup.fromQuickData(data as any);

    expect(matchup.format).toEqual(getFormat("Singles"));
    expect(matchup.ruleset).toEqual(getRuleset("Gen9 NatDex"));
    expect(matchup.aTeam.teamName).toBe("Team 1");
    expect(matchup.aTeam.team.length).toBe(2);
    expect(matchup.aTeam.team[0].id).toBe("pikachu");
    expect(matchup.bTeam.teamName).toBe("Team 2");
    expect(matchup.bTeam.team.length).toBe(2);
    expect(matchup.bTeam.team[0].id).toBe("mewtwo");
  });

  it("should create a matchup from data", async () => {
    const matchupId = new Types.ObjectId();

    const matchupData: MatchupData & { _id: Types.ObjectId } = {
      _id: matchupId,
      aTeam: {
        _id: draft._id!,
      },
      bTeam: {
        teamName: "Team B",
        coach: "Coach B",
        team: [{ id: "mewtwo" as ID }, { id: "mew" as ID }],
      },
      stage: "Week 1",
      matches: [],
    };

    const draftDoc = {
      ...draft.toData(),
      _id: draft._id,
    };

    (draftService.getDraft as jest.Mock).mockResolvedValue(draftDoc as any);

    const matchup = await Matchup.fromData(matchupData);

    expect(matchup.aTeam.teamName).toBe("Team A");
    expect(matchup.bTeam.teamName).toBe("Team B");
    expect(matchup.leagueName).toBe("Test league");
    expect(matchup.stage).toBe("Week 1");
    expect(matchup.aTeam.team.length).toBe(2);
    expect(matchup.bTeam.team.length).toBe(2);
  });

  it("should create a matchup from form", () => {
    const matchup = Matchup.fromForm(draft, opponent);

    expect(matchup.aTeam.teamName).toBe("Team A");
    expect(matchup.bTeam.teamName).toBe("Team B");
    expect(matchup.leagueName).toBe("Test league");
    expect(matchup.stage).toBe("Week 1");
  });

  it("should convert to data object", () => {
    const matchup = Matchup.fromForm(draft, opponent);
    const matchupData = matchup.toData();

    expect(matchupData.aTeam._id).toBe(draft._id);
    expect(matchupData.bTeam.teamName).toBe("Team B");
    expect(matchupData.bTeam.team.length).toBe(2);
    expect(matchupData.bTeam.team[0].id).toBe("mewtwo");
    expect(matchupData.stage).toBe("Week 1");
  });

  it("should convert to client object", () => {
    const matchup = Matchup.fromForm(draft, opponent);
    const clientMatchup = matchup.toClient();

    expect(clientMatchup.aTeam.teamName).toBe("Team A");
    expect(clientMatchup.bTeam.teamName).toBe("Team B");
    expect(clientMatchup.leagueName).toBe("Test league");
    expect(clientMatchup.stage).toBe("Week 1");
    expect(clientMatchup.aTeam.team.length).toBe(2);
    expect(clientMatchup.bTeam.team.length).toBe(2);
  });

  it("should convert to opponent object", () => {
    const matchup = Matchup.fromForm(draft, opponent);
    const opponentObject = matchup.toOpponent();

    expect(opponentObject.teamName).toBe("Team B");
    expect(opponentObject.coach).toBe("user-b");
    expect(opponentObject.stage).toBe("Week 1");
    expect(opponentObject.team.length).toBe(2);
    expect(opponentObject.team[0].id).toBe("mewtwo");
  });

  it("should analyze the matchup", async () => {
    const matchup = Matchup.fromForm(draft, opponent);

    (coverageService.coveragechart as jest.Mock).mockResolvedValue([]);
    (movechartService.movechart as jest.Mock).mockResolvedValue([]);
    (speedchartService.speedchart as jest.Mock).mockReturnValue({
      list: [],
      tiers: [],
    });

    const analysis = await matchup.analyze();

    expect(analysis.details.format).toBe("Singles");
    expect(analysis.details.ruleset).toBe("Gen9 NatDex");
    expect(analysis.summary.length).toBe(2);
    expect(analysis.speedchart).toEqual({ list: [], tiers: [] });
    expect(analysis.coveragechart.length).toBe(2);
    expect(analysis.typechart.length).toBe(2);
    expect(analysis.movechart.length).toBe(2);
  });
});

describe("Score", () => {
  it("should process score data correctly", async () => {
    const scoreData = {
      aTeamPaste: "https://pokepast.es/1234567890abcdef",
      bTeamPaste: "https://pokepast.es/fedcba0987654321",
      matches: [
        {
          replay: "https://replay.pokemonshowdown.com/gen9vgc2023-1234567890",
          winner: "a" as "a" | "b" | "",
          aTeam: {
            team: [
              {
                pokemon: { id: "pikachu" },
                kills: 1,
                fainted: 0,
                indirect: 0,
                brought: 1,
              },
              {
                pokemon: { id: "charizard" },
                kills: 0,
                fainted: 1,
                indirect: 0,
                brought: 1,
              },
            ],
          },
          bTeam: {
            team: [
              {
                pokemon: { id: "mewtwo" },
                kills: 1,
                fainted: 0,
                indirect: 0,
                brought: 1,
              },
              {
                pokemon: { id: "mew" },
                kills: 0,
                fainted: 1,
                indirect: 0,
                brought: 1,
              },
            ],
          },
        },
      ],
    };

    const score = new Score(scoreData);
    const processedScore = await score.processScore();

    expect(processedScore.aTeamPaste).toBe(
      "https://pokepast.es/1234567890abcdef"
    );
    expect(processedScore.bTeamPaste).toBe(
      "https://pokepast.es/fedcba0987654321"
    );
    expect(processedScore.matches.length).toBe(1);
    expect(processedScore.matches[0].replay).toBe(
      "https://replay.pokemonshowdown.com/gen9vgc2023-1234567890"
    );
    expect(processedScore.matches[0].winner).toBe("a");
    expect(processedScore.matches[0].aTeam.stats.length).toBe(2);
    expect(processedScore.matches[0].bTeam.stats.length).toBe(2);
    expect(processedScore.matches[0].aTeam.score).toBe(1);
    expect(processedScore.matches[0].bTeam.score).toBe(1);
  });

  it("should process score data with no brought pokemon", async () => {
    const scoreData = {
      aTeamPaste: "",
      bTeamPaste: "",
      matches: [
        {
          replay: "",
          winner: "" as "a" | "b" | "",
          aTeam: {
            team: [
              {
                pokemon: { id: "pikachu" },
                kills: 0,
                fainted: 0,
                indirect: 0,
                brought: 0,
              },
            ],
          },
          bTeam: {
            team: [
              {
                pokemon: { id: "mewtwo" },
                kills: 0,
                fainted: 0,
                indirect: 0,
                brought: 0,
              },
            ],
          },
        },
      ],
    };

    const score = new Score(scoreData);
    const processedScore = await score.processScore();

    expect(processedScore.matches[0].aTeam.stats.length).toBe(0);
    expect(processedScore.matches[0].bTeam.stats.length).toBe(0);
  });
});

describe("GameTime", () => {
  it("should process time data with email enabled", async () => {
    const timeData = {
      dateTime: "2025-09-10T12:00:00.000Z",
      email: true,
      emailTime: 30,
    };

    const gameTime = new GameTime(timeData);
    const processedTime = await gameTime.processTime();

    expect(processedTime.dateTime).toBe("2025-09-10T12:00:00.000Z");
    expect(processedTime.emailTime).toBe(1800);
  });

  it("should process time data with email disabled", async () => {
    const timeData = {
      dateTime: "2025-09-10T12:00:00.000Z",
      email: false,
      emailTime: 30,
    };

    const gameTime = new GameTime(timeData);
    const processedTime = await gameTime.processTime();

    expect(processedTime.dateTime).toBe("2025-09-10T12:00:00.000Z");
    expect(processedTime.emailTime).toBe(-1);
  });
});
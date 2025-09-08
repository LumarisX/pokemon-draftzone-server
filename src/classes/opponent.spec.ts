import { Opponent, getMatchesScore } from "./opponent";
import { getRuleset, Ruleset } from "../data/rulesets";
import { DraftSpecie, PokemonFormData } from "./pokemon";
import { MatchData } from "../models/matchup.model";
import { Types } from "mongoose";
import { ID } from "@pkmn/data";

describe("Opponent", () => {
  const ruleset: Ruleset = getRuleset("Gen9 NatDex");

  const pokemonFormData: PokemonFormData = {
    id: "absol" as ID,
    name: "Absol",
  };

  const draftSpecie = new DraftSpecie(pokemonFormData, ruleset);

  const matchData: MatchData = {
    aTeam: {
      stats: [
        ["absol", { brought: 1, deaths: 0, kills: 1 }],
      ],
      score: 0,
    },
    bTeam: {
      stats: [
        ["absol", { brought: 1, deaths: 1, kills: 0 }],
      ],
      score: 0,
    },
    winner: "a",
    replay: "test.com",
  };

  const opponentData = {
    stage: "Playoffs",
    teamName: "Team A",
    coach: "Coach A",
    team: [pokemonFormData],
    matches: [matchData],
    _id: new Types.ObjectId(),
  };

  it("should create an Opponent instance from form data", () => {
    const opponent = Opponent.fromForm(opponentData, ruleset);
    expect(opponent).toBeInstanceOf(Opponent);
    expect(opponent.teamName).toBe("Team A");
    expect(opponent.coach).toBe("Coach A");
    expect(opponent.team.length).toBe(1);
    expect(opponent.team[0]).toBeInstanceOf(DraftSpecie);
  });

  it("should create an Opponent instance from form data with undefined coach", () => {
    const opponentDataWithoutCoach = { ...opponentData, coach: undefined };
    const opponent = Opponent.fromForm(opponentDataWithoutCoach, ruleset);
    expect(opponent).toBeInstanceOf(Opponent);
    expect(opponent.coach).toBeUndefined();
  });

  it("should create an Opponent instance from form data with empty team", () => {
    const opponentDataWithEmptyTeam = { ...opponentData, team: [] };
    const opponent = Opponent.fromForm(opponentDataWithEmptyTeam, ruleset);
    expect(opponent).toBeInstanceOf(Opponent);
    expect(opponent.team.length).toBe(0);
  });

  it("should convert to client object", () => {
    const opponent = new Opponent(
      ruleset,
      [draftSpecie],
      "Team A",
      [matchData],
      "Playoffs",
      "Coach A",
      opponentData._id
    );
    const clientObject = opponent.toClient();
    expect(clientObject.teamName).toBe("Team A");
    expect(clientObject.coach).toBe("Coach A");
    expect(clientObject.team.length).toBe(1);
    expect(clientObject.score).toEqual([1, 0]);
    expect(clientObject._id).toBe(opponentData._id);
  });

  it("should convert to client object with undefined coach", () => {
    const opponent = new Opponent(
      ruleset,
      [draftSpecie],
      "Team A",
      [matchData],
      "Playoffs",
      undefined,
      opponentData._id
    );
    const clientObject = opponent.toClient();
    expect(clientObject.coach).toBeUndefined();
  });

  it("should convert to client object with empty matches", () => {
    const opponent = new Opponent(
      ruleset,
      [draftSpecie],
      "Team A",
      [],
      "Playoffs",
      "Coach A",
      opponentData._id
    );
    const clientObject = opponent.toClient();
    expect(clientObject.score).toBeNull();
  });

  it("should convert to data object", () => {
    const opponent = new Opponent(
      ruleset,
      [draftSpecie],
      "Team A",
      [matchData],
      "Playoffs",
      "Coach A",
      opponentData._id
    );
    const dataObject = opponent.toData();
    expect(dataObject.bTeam.teamName).toBe("Team A");
    expect(dataObject.bTeam.coach).toBe("Coach A");
    expect(dataObject.bTeam.team.length).toBe(1);
    expect(dataObject.stage).toBe("Playoffs");
  });

  it("should convert to data object with undefined coach", () => {
    const opponent = new Opponent(
      ruleset,
      [draftSpecie],
      "Team A",
      [matchData],
      "Playoffs",
      undefined,
      opponentData._id
    );
    const dataObject = opponent.toData();
    expect(dataObject.bTeam.coach).toBeUndefined();
  });
});

describe("getMatchesScore", () => {
  it("should return null if no matches", () => {
    const score = getMatchesScore(undefined);
    expect(score).toBeNull();
  });

  it("should return null if empty matches", () => {
    const score = getMatchesScore([]);
    expect(score).toBeNull();
  });

  it("should calculate score for a single match", () => {
    const matchData: MatchData = {
      aTeam: {
        stats: [
          ["absol", { brought: 1, deaths: 0, kills: 1 }],
          ["pikachu", { brought: 1, deaths: 1, kills: 0 }],
        ],
        score: 0,
      },
      bTeam: {
        stats: [
          ["charizard", { brought: 1, deaths: 1, kills: 0 }],
          ["blastoise", { brought: 1, deaths: 0, kills: 1 }],
        ],
        score: 0,
      },
      winner: "a",
      replay: "test.com",
    };
    const score = getMatchesScore([matchData]);
    expect(score).toEqual([1, 1]);
  });

  it("should calculate score for a single match with 0-0 score", () => {
    const matchData: MatchData = {
      aTeam: {
        stats: [
          ["absol", { brought: 1, deaths: 1, kills: 0 }],
          ["pikachu", { brought: 0, deaths: 0, kills: 0 }],
        ],
        score: 0,
      },
      bTeam: {
        stats: [
          ["charizard", { brought: 1, deaths: 1, kills: 0 }],
          ["blastoise", { brought: 0, deaths: 0, kills: 0 }],
        ],
        score: 0,
      },
      winner: "a", // Winner doesn't matter for single match score calculation based on brought/deaths
      replay: "test.com",
    };
    const score = getMatchesScore([matchData]);
    expect(score).toEqual([0, 0]);
  });

  it("should calculate score for multiple matches", () => {
    const matchData1: MatchData = {
      aTeam: { stats: [], score: 0 },
      bTeam: { stats: [], score: 0 },
      winner: "a",
      replay: "test.com",
    };
    const matchData2: MatchData = {
      aTeam: { stats: [], score: 0 },
      bTeam: { stats: [], score: 0 },
      winner: "b",
      replay: "test.com",
    };
    const matchData3: MatchData = {
      aTeam: { stats: [], score: 0 },
      bTeam: { stats: [], score: 0 },
      winner: "a",
      replay: "test.com",
    };
    const score = getMatchesScore([matchData1, matchData2, matchData3]);
    expect(score).toEqual([2, 1]);
  });
});
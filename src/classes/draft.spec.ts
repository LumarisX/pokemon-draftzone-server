import { Types } from "mongoose";
import { FormatId, getFormat } from "../data/formats";
import { getRuleset, RulesetId } from "../data/rulesets";
import { Draft } from "./draft";
import { DraftSpecie, PokemonFormData } from "./pokemon";
import * as matchupService from "../services/database-services/matchup.service";
import { ID, TypeName } from "@pkmn/data";
import { MatchupDocument } from "../models/draft/matchup.model";

jest.mock("../services/database-services/matchup.service");

const ruleset = getRuleset("Gen9 NatDex");
const format = getFormat("Singles");

describe("Draft", () => {
  const formData = {
    leagueName: "Test League",
    teamName: "Test Team",
    format: "Singles",
    ruleset: "Gen9 NatDex",
    team: [
      { id: "pikachu", nickname: "Pika" },
      { id: "charizard", nickname: "Zard" },
    ] as PokemonFormData[],
  };

  const user_id = "test_user";

  it("should be created from form data", () => {
    const draft = Draft.fromForm(formData, user_id, ruleset, format);

    expect(draft.leagueName).toBe("Test League");
    expect(draft.teamName).toBe("Test Team");
    expect(draft.format).toBe(format);
    expect(draft.ruleset).toBe(ruleset);
    expect(draft.owner).toBe(user_id);
    expect(draft.team.length).toBe(2);
    expect(draft.team[0]).toBeInstanceOf(DraftSpecie);
    expect(draft.team[0].id).toBe("pikachu");
    expect(draft.team[1].id).toBe("charizard");
  });

  it("should convert to data object", () => {
    const draft = Draft.fromForm(formData, user_id, ruleset, format);
    const draftData = draft.toData();

    expect(draftData.leagueName).toBe("Test League");
    expect(draftData.teamName).toBe("Test Team");
    expect(draftData.format).toBe("Singles");
    expect(draftData.ruleset).toBe("Gen9 NatDex");
    expect(draftData.owner).toBe(user_id);
    expect(draftData.team.length).toBe(2);
    expect(draftData.team[0].id).toBe("pikachu");
    expect(draftData.team[1].id).toBe("charizard");
  });

  it("should convert to client object", async () => {
    const draft = Draft.fromForm(formData, user_id, ruleset, format);
    draft._id = new Types.ObjectId();
    (matchupService.getMatchupsByDraftId as jest.Mock).mockResolvedValue([]);

    const clientDraft = await draft.toClient();

    expect(clientDraft.leagueName).toBe("Test League");
    expect(clientDraft.teamName).toBe("Test Team");
    expect(clientDraft.format).toBe("Singles");
    expect(clientDraft.ruleset).toBe("Gen9 NatDex");
    expect(clientDraft.team.length).toBe(2);
    expect(clientDraft.team[0].id).toBe("pikachu");
    expect(clientDraft.team[1].id).toBe("charizard");
  });

  it("should be created from data object", () => {
    const draftData = {
      _id: new Types.ObjectId(),
      leagueName: "Test League",
      leagueId: "testleague",
      teamName: "Test Team",
      format: "Singles" as FormatId,
      ruleset: "Gen9 NatDex" as RulesetId,
      score: { wins: 0, loses: 0, diff: "0" },
      owner: user_id,
      team: [
        { id: "pikachu" as ID, nickname: "Pika" },
        { id: "charizard" as ID, nickname: "Zard" },
      ],
    };

    const draft = Draft.fromData(draftData, ruleset, format);

    expect(draft.leagueName).toBe("Test League");
    expect(draft.teamName).toBe("Test Team");
    expect(draft.format).toBe(format);
    expect(draft.ruleset).toBe(ruleset);
    expect(draft.owner).toBe(user_id);
    expect(draft.team.length).toBe(2);
    expect(draft.team[0]).toBeInstanceOf(DraftSpecie);
    expect(draft.team[0].id).toBe("pikachu");
    expect(draft.team[1].id).toBe("charizard");
  });

  describe("fromData", () => {
    const baseDraftData = {
      _id: new Types.ObjectId(),
      leagueName: "Test League",
      leagueId: "testleague",
      teamName: "Test Team",
      format: "Singles" as FormatId,
      ruleset: "Gen9 NatDex" as RulesetId,
      score: { wins: 0, loses: 0, diff: "0" },
      owner: user_id,
    };

    it("should handle capt with empty tera array", () => {
      const draftData = {
        ...baseDraftData,
        team: [
          {
            id: "pikachu" as ID,
            nickname: "Pika",
            capt: { tera: [] },
          },
        ],
      };
      const draft = Draft.fromData(draftData, ruleset, format);
      expect(draft.team[0].capt?.tera).toEqual([]);
    });

    it("should handle capt with empty z array", () => {
      const draftData = {
        ...baseDraftData,
        team: [
          {
            id: "pikachu" as ID,
            nickname: "Pika",
            capt: { z: [] },
          },
        ],
      };
      const draft = Draft.fromData(draftData, ruleset, format);
      expect(draft.team[0].capt?.z).toEqual([]);
    });

    it("should handle capt with undefined tera and z", () => {
      const draftData = {
        ...baseDraftData,
        team: [
          {
            id: "pikachu" as ID,
            nickname: "Pika",
            capt: {},
          },
        ],
      };
      const draft = Draft.fromData(draftData, ruleset, format);
      expect(draft.team[0].capt?.tera).toBeUndefined();
      expect(draft.team[0].capt?.z).toBeUndefined();
    });

    it("should handle capt with defined tera and z", () => {
      const draftData = {
        ...baseDraftData,
        team: [
          {
            id: "pikachu" as ID,
            nickname: "Pika",
            capt: {
              tera: ["Electric"] as TypeName[],
              z: ["Normal"] as TypeName[],
            },
          },
        ],
      };
      const draft = Draft.fromData(draftData, ruleset, format);
      expect(draft.team[0].capt?.tera).toEqual(["Electric"]);
      expect(draft.team[0].capt?.z).toEqual(["Normal"]);
    });

    it("should handle pokemon without capt", () => {
      const draftData = {
        ...baseDraftData,
        team: [{ id: "pikachu" as ID, nickname: "Pika" }],
      };
      const draft = Draft.fromData(draftData, ruleset, format);
      expect(draft.team[0].capt).toEqual({
        tera: undefined,
        z: undefined,
        dmax: undefined,
      });
    });
  });

  describe("getScore", () => {
    it("should calculate the score correctly for single-match games", async () => {
      const draft = Draft.fromForm(formData, user_id, ruleset, format);
      draft._id = new Types.ObjectId();

      const matchups = [
        {
          matches: [{ aTeam: { score: 1 }, bTeam: { score: 0 }, winner: "a" }],
        },
        {
          matches: [{ aTeam: { score: 0 }, bTeam: { score: 2 }, winner: "b" }],
        },
        {
          matches: [{ aTeam: { score: 3 }, bTeam: { score: 3 }, winner: "" }],
        },
      ] as unknown as MatchupDocument[];

      (matchupService.getMatchupsByDraftId as jest.Mock).mockResolvedValue(
        matchups
      );

      const score = await draft.getScore();

      expect(score.wins).toBe(1);
      expect(score.loses).toBe(1);
      expect(score.diff).toBe("-1");
    });

    it("should calculate the score correctly for multi-match games", async () => {
      const draft = Draft.fromForm(formData, user_id, ruleset, format);
      draft._id = new Types.ObjectId();

      const matchups = [
        {
          matches: [{ winner: "a" }, { winner: "a" }, { winner: "b" }],
        },
        {
          matches: [{ winner: "b" }, { winner: "b" }],
        },
        {
          matches: [{ winner: "a" }, { winner: "b" }],
        },
      ] as unknown as MatchupDocument[];

      (matchupService.getMatchupsByDraftId as jest.Mock).mockResolvedValue(
        matchups
      );

      const score = await draft.getScore();

      expect(score.wins).toBe(1);
      expect(score.loses).toBe(1);
      expect(score.diff).toBe("-1");
    });
  });
});

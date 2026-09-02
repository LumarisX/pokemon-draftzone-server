import { Model } from "mongoose";
import { ExternalMatch } from "./external-matchup-match/external-matchup-match.domain";
import { MatchMapper } from "./external-matchup-match/external-matchup-match.mapper";
import { ExternalMatchupRepository } from "./external-matchup.repository";
import { ExternalMatchupDocument } from "./external-matchup.schema";

jest.mock("./external-matchup-match/external-matchup-match.mapper", () => ({
  MatchMapper: {
    toDatabasePayload: jest.fn(),
  },
}));

const mockedMatchMapper = MatchMapper as jest.Mocked<typeof MatchMapper>;

describe("ExternalMatchupRepository", () => {
  let model: jest.Mocked<Model<ExternalMatchupDocument>>;
  let repository: ExternalMatchupRepository;

  beforeEach(() => {
    model = {
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(undefined),
      }),
    } as unknown as jest.Mocked<Model<ExternalMatchupDocument>>;
    repository = new ExternalMatchupRepository(model);
    mockedMatchMapper.toDatabasePayload.mockImplementation(
      (m: any) => ({ persisted: m }) as any,
    );
  });

  describe("updateScore", () => {
    const matches = [
      { winner: "a" } as unknown as ExternalMatch,
      { winner: "b" } as unknown as ExternalMatch,
    ];

    it("maps every match through MatchMapper.toDatabasePayload", async () => {
      await repository.updateScore("matchup-1", matches);

      // toDatabasePayload must be invoked with the match as its first arg even
      // though it is mapped over an array (regression: it relied on `this`).
      expect(mockedMatchMapper.toDatabasePayload.mock.calls[0][0]).toBe(matches[0]);
      expect(mockedMatchMapper.toDatabasePayload.mock.calls[1][0]).toBe(matches[1]);
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        "matchup-1",
        {
          $set: {
            matches: [{ persisted: matches[0] }, { persisted: matches[1] }],
          },
          $unset: { scoreOverride: "", winnerOverride: "", forfeitedBy: "" },
        },
        { returnDocument: "after" },
      );
    });

    it("includes both pastes when provided", async () => {
      await repository.updateScore("matchup-1", matches, {
        aTeamPaste: "a-paste",
        bTeamPaste: "b-paste",
      });

      const setData = (model.findByIdAndUpdate as jest.Mock).mock.calls[0][1].$set;
      expect(setData["aTeam.paste"]).toBe("a-paste");
      expect(setData["bTeam.paste"]).toBe("b-paste");
    });

    it("omits a paste key entirely when its value is undefined", async () => {
      await repository.updateScore("matchup-1", matches, {
        bTeamPaste: "b-paste",
      });

      const setData = (model.findByIdAndUpdate as jest.Mock).mock.calls[0][1].$set;
      expect("aTeam.paste" in setData).toBe(false);
      expect(setData["bTeam.paste"]).toBe("b-paste");
    });

    it("persists an empty-string paste (distinct from undefined)", async () => {
      await repository.updateScore("matchup-1", matches, { aTeamPaste: "" });

      const setData = (model.findByIdAndUpdate as jest.Mock).mock.calls[0][1].$set;
      expect(setData["aTeam.paste"]).toBe("");
    });
  });

  describe("update", () => {
    it("routes undefined entity fields to $unset so a cleared field clears", async () => {
      await repository.update("matchup-1", {
        stage: "Round 3",
        scheduledDate: undefined,
        opponentTimezone: undefined,
      });

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        "matchup-1",
        {
          $set: { stage: "Round 3" },
          $unset: { scheduledDate: "", opponentTimezone: "" },
        },
        { returnDocument: "after" },
      );
    });

    it("leaves absent keys alone rather than unsetting them", async () => {
      await repository.update("matchup-1", { stage: "Round 3" });

      const call = (model.findByIdAndUpdate as jest.Mock).mock.calls[0][1];
      expect(call.$unset).toEqual({});
      expect("notes" in call.$set).toBe(false);
    });
  });

  describe("updateSchedule", () => {
    it("sets both fields when a date and zone are given", async () => {
      const when = new Date("2026-09-06T02:00:00.000Z");
      await repository.updateSchedule("matchup-1", when, "America/Chicago");

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        "matchup-1",
        {
          $set: { scheduledDate: when, opponentTimezone: "America/Chicago" },
          $unset: {},
        },
        { returnDocument: "after" },
      );
    });

    it("unsets the zone alongside the date when the time is cleared", async () => {
      await repository.updateSchedule("matchup-1", null, "America/Chicago");

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        "matchup-1",
        {
          $set: {},
          $unset: { scheduledDate: "", opponentTimezone: "" },
        },
        { returnDocument: "after" },
      );
    });
  });
});

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
        },
        { new: true },
      );
    });

    it("includes both pastes when provided", async () => {
      await repository.updateScore("matchup-1", matches, "a-paste", "b-paste");

      const setData = (model.findByIdAndUpdate as jest.Mock).mock.calls[0][1].$set;
      expect(setData["aTeam.paste"]).toBe("a-paste");
      expect(setData["bTeam.paste"]).toBe("b-paste");
    });

    it("omits a paste key entirely when its value is undefined", async () => {
      await repository.updateScore("matchup-1", matches, undefined, "b-paste");

      const setData = (model.findByIdAndUpdate as jest.Mock).mock.calls[0][1].$set;
      expect("aTeam.paste" in setData).toBe(false);
      expect(setData["bTeam.paste"]).toBe("b-paste");
    });

    it("persists an empty-string paste (distinct from undefined)", async () => {
      await repository.updateScore("matchup-1", matches, "");

      const setData = (model.findByIdAndUpdate as jest.Mock).mock.calls[0][1].$set;
      expect(setData["aTeam.paste"]).toBe("");
    });
  });
});

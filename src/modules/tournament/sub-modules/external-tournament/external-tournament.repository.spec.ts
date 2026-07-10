import mongoose, { Model } from "mongoose";
import { PDZError } from "@core/pdz-error";
import { ExternalTournament } from "./external-tournament.domain";
import { ExternalTournamentMapper } from "./external-tournament.mapper";
import { ExternalTournamentRepository } from "./external-tournament.repository";
import { ExternalTournamentDocument } from "./external-tournament.schema";

jest.mock("./external-tournament.mapper", () => ({
  ExternalTournamentMapper: {
    toDatabasePayload: jest.fn(),
  },
}));

const mockedMapper = ExternalTournamentMapper as jest.Mocked<
  typeof ExternalTournamentMapper
>;

function duplicateKeyError(
  keyPattern: Record<string, number> = { leagueId: 1, owner: 1 },
): Error {
  const error = new mongoose.mongo.MongoServerError({
    message:
      "E11000 duplicate key error collection: draftzone.drafts index: owner_1_leagueId_1",
  });
  error.code = 11000;
  error.keyPattern = keyPattern;
  return error;
}

describe("ExternalTournamentRepository", () => {
  const tournament = {
    leagueName: "PPDL",
    key: "ppdl",
  } as unknown as ExternalTournament;

  let save: jest.Mock;
  let findOneAndUpdate: jest.Mock;
  let model: jest.Mocked<Model<ExternalTournamentDocument>>;
  let repository: ExternalTournamentRepository;

  beforeEach(() => {
    save = jest.fn().mockResolvedValue(undefined);
    findOneAndUpdate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: "existing" }),
    });
    const modelConstructor = jest.fn().mockImplementation(() => ({ save }));
    model = Object.assign(modelConstructor, {
      findOneAndUpdate,
    }) as unknown as jest.Mocked<Model<ExternalTournamentDocument>>;
    repository = new ExternalTournamentRepository(model);
    mockedMapper.toDatabasePayload.mockReturnValue({ persisted: true } as any);
  });

  describe("create", () => {
    it("saves the mapped payload", async () => {
      await repository.create(tournament);

      expect(mockedMapper.toDatabasePayload).toHaveBeenCalledWith(tournament);
      expect(save).toHaveBeenCalled();
    });

    it("translates a duplicate-key error into DR-011 (409)", async () => {
      save.mockRejectedValue(duplicateKeyError());

      const promise = repository.create(tournament);
      await expect(promise).rejects.toBeInstanceOf(PDZError);
      await promise.catch((error: PDZError) => {
        expect(error.code).toBe("DR-011");
        expect(error.getStatus()).toBe(409);
        expect(error.details).toEqual({ leagueName: "PPDL" });
      });
    });

    it("rethrows non-duplicate errors untouched", async () => {
      const boom = new Error("connection reset");
      save.mockRejectedValue(boom);

      await expect(repository.create(tournament)).rejects.toBe(boom);
    });

    it("rethrows a duplicate-key error from a different unique index", async () => {
      const otherIndex = duplicateKeyError({ someOtherField: 1 });
      save.mockRejectedValue(otherIndex);

      await expect(repository.create(tournament)).rejects.toBe(otherIndex);
    });

    it("rethrows a plain error that merely carries code 11000", async () => {
      const impostor = Object.assign(new Error("not a mongo error"), {
        code: 11000,
        keyPattern: { leagueId: 1 },
      });
      save.mockRejectedValue(impostor);

      await expect(repository.create(tournament)).rejects.toBe(impostor);
    });
  });

  describe("updateByKeyAndOwner", () => {
    it("translates a duplicate-key error into DR-011 (409)", async () => {
      findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockRejectedValue(duplicateKeyError()),
      });

      const promise = repository.updateByKeyAndOwner("old-key", "owner", tournament);
      await expect(promise).rejects.toBeInstanceOf(PDZError);
      await promise.catch((error: PDZError) => {
        expect(error.code).toBe("DR-011");
        expect(error.getStatus()).toBe(409);
      });
    });
  });
});

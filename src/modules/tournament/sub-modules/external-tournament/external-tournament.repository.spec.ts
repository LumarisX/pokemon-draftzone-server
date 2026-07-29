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
  keyPattern: Record<string, number> = { slug: 1, owner: 1 },
): Error {
  const error = new mongoose.mongo.MongoServerError({
    message:
      "E11000 duplicate key error collection: draftzone.drafts index: owner_1_slug_1",
  });
  error.code = 11000;
  error.keyPattern = keyPattern;
  return error;
}

describe("ExternalTournamentRepository", () => {
  const tournament = {
    leagueName: "PPDL",
    slug: "ppdl",
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

    it("re-rolls the slug and retries when the generated one is already taken", async () => {
      save
        .mockRejectedValueOnce(duplicateKeyError())
        .mockResolvedValueOnce(undefined);

      await repository.create(tournament);

      expect(save).toHaveBeenCalledTimes(2);
      // The retry must carry a different slug, otherwise it just collides again.
      expect(tournament.slug).not.toBe("ppdl");
      expect(tournament.slug).toMatch(/^[0-9A-Za-z]{8}$/);
    });

    it("gives up with DR-012 once the retries are exhausted", async () => {
      save.mockRejectedValue(duplicateKeyError());

      const promise = repository.create(tournament);
      await expect(promise).rejects.toBeInstanceOf(PDZError);
      await promise.catch((error: PDZError) => {
        // Not DR-011: a collision here is chance, not a name the user already used.
        expect(error.code).toBe("DR-012");
        expect(error.getStatus()).toBe(500);
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
        keyPattern: { slug: 1 },
      });
      save.mockRejectedValue(impostor);

      await expect(repository.create(tournament)).rejects.toBe(impostor);
    });
  });

  describe("updateBySlugAndOwner", () => {
    it("rethrows a duplicate-key error rather than reinterpreting it", async () => {
      // The filter and the upserted doc share owner+slug, so the unique index
      // can only reject something the filter would have matched — reaching
      // here means a genuine fault, not a name the user already used.
      const duplicate = duplicateKeyError();
      findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockRejectedValue(duplicate),
      });

      await expect(
        repository.updateBySlugAndOwner("old-key", "owner", tournament),
      ).rejects.toBe(duplicate);
    });
  });
});

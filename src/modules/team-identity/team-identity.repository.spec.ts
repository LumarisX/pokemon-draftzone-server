import { ErrorCodes } from "@core/pdz-error-codes";
import { Model, Types } from "mongoose";
import { TeamIdentityRepository } from "./team-identity.repository";
import { TeamIdentityDocument } from "./team-identity.schema";

const OWNER = "auth0|ash";

function query<T>(value: T) {
  return { lean: () => ({ exec: async () => value }), exec: async () => value };
}

function repository(found: unknown, options: { clash?: boolean } = {}) {
  const createdId = new Types.ObjectId();
  const model = {
    findOne: jest.fn(() => query(found)),
    exists: jest.fn(() => query(options.clash ? { _id: new Types.ObjectId() } : null)),
    updateOne: jest.fn(() => query({ modifiedCount: 1 })),
    create: jest.fn(async () => ({ _id: createdId })),
  };
  return {
    repo: new TeamIdentityRepository(
      model as unknown as Model<TeamIdentityDocument>,
    ),
    model,
    createdId,
  };
}

describe("TeamIdentityRepository.record", () => {
  it("creates a new identity with its logo when the name is new", async () => {
    const { repo, model, createdId } = repository(null);

    const id = await repo.record(OWNER, " Sturdy Shedinjas ", "team-logos/s.png");

    expect(id).toBe(createdId);
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: OWNER,
        name: "Sturdy Shedinjas",
        nameKey: "sturdyshedinjas",
        logo: "team-logos/s.png",
        active: true,
      }),
    );
  });

  it("reuses the identity with the same name and logo, only marking it used", async () => {
    const existingId = new Types.ObjectId();
    const { repo, model } = repository({
      _id: existingId,
      name: "Sturdy Shedinjas",
      logo: "team-logos/s.png",
    });

    const id = await repo.record(OWNER, "sturdy shedinjas", "team-logos/s.png");

    expect(model.findOne).toHaveBeenCalledWith({
      owner: { $eq: OWNER },
      nameKey: "sturdyshedinjas",
      logo: { $eq: "team-logos/s.png" },
      active: true,
    });
    expect(id).toBe(existingId);
    expect(model.create).not.toHaveBeenCalled();
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: existingId },
      { $set: { lastUsedAt: expect.any(Date) } },
    );
  });

  it("makes a separate identity for the same name with another logo", async () => {
    const { repo, model, createdId } = repository(null);

    const id = await repo.record(OWNER, "Sturdy Shedinjas", undefined);

    expect(model.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ logo: { $eq: null } }),
    );
    expect(id).toBe(createdId);
    expect(model.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ logo: expect.anything() }),
    );
  });
});

describe("TeamIdentityRepository.rename", () => {
  const id = new Types.ObjectId();

  it("renames without touching the logo", async () => {
    const { repo, model } = repository({ _id: id, name: "Owls", logo: "team-logos/o.png" });

    const result = await repo.rename(id.toString(), OWNER, " Night Owls ");

    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: id },
      { $set: { name: "Night Owls", nameKey: "nightowls" } },
    );
    expect(result).toEqual({
      id: id.toString(),
      name: "Night Owls",
      logo: "team-logos/o.png",
    });
  });

  it("only checks for a twin with the same logo", async () => {
    const { repo, model } = repository({ _id: id, name: "Owls", logo: "team-logos/o.png" });

    await repo.rename(id.toString(), OWNER, "Newts");

    expect(model.exists).toHaveBeenCalledWith(
      expect.objectContaining({ nameKey: "newts", logo: { $eq: "team-logos/o.png" } }),
    );
  });

  it("refuses a rename that would duplicate another team with the same logo", async () => {
    const { repo, model } = repository(
      { _id: id, name: "Owls", logo: "team-logos/o.png" },
      { clash: true },
    );

    await expect(repo.rename(id.toString(), OWNER, "Newts")).rejects.toMatchObject({
      code: ErrorCodes.TEAM_IDENTITY.NAME_TAKEN.code,
    });
    expect(model.updateOne).not.toHaveBeenCalled();
  });

  it("answers someone else's identity the same as a missing one", async () => {
    const { repo } = repository(null);

    await expect(
      repo.rename(id.toString(), OWNER, "Owls"),
    ).rejects.toMatchObject({ code: ErrorCodes.TEAM_IDENTITY.NOT_FOUND.code });
  });
});

describe("TeamIdentityRepository.remove", () => {
  it("retires the identity so its name can be used again", async () => {
    const id = new Types.ObjectId();
    const { repo, model } = repository({ _id: id, name: "Owls" });

    await repo.remove(id.toString(), OWNER);

    expect(model.findOne).toHaveBeenCalledWith({
      _id: id,
      owner: { $eq: OWNER },
      active: true,
    });
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: id },
      { $unset: { active: "" }, $set: { deletedAt: expect.any(Date) } },
    );
  });

  it("refuses an id that is not an object id", async () => {
    const { repo, model } = repository({ _id: new Types.ObjectId() });

    await expect(repo.remove("nope", OWNER)).rejects.toMatchObject({
      code: ErrorCodes.TEAM_IDENTITY.NOT_FOUND.code,
    });
    expect(model.findOne).not.toHaveBeenCalled();
  });
});

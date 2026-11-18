import { Model, Types } from "mongoose";
import { CoachRepository } from "./coach.repository";
import { CoachDocument } from "./coach.schema";

function query<T>(value: T) {
  return { exec: async () => value };
}

function repository() {
  const model = {
    find: jest.fn(() => query([])),
    updateMany: jest.fn(() => query({ modifiedCount: 2 })),
  };
  return {
    repo: new CoachRepository(model as unknown as Model<CoachDocument>),
    model,
  };
}

describe("CoachRepository.findRunningByAuth0Id", () => {
  it("matches only rows that have not left and are not completed", async () => {
    const { repo, model } = repository();

    await repo.findRunningByAuth0Id("account-1");

    expect(model.find).toHaveBeenCalledWith({
      auth0Id: { $eq: "account-1" },
      leftAt: null,
      completedAt: null,
    });
  });
});

describe("CoachRepository.setDiscordName", () => {
  it("sets the name on exactly the given rows", async () => {
    const { repo, model } = repository();
    const first = new Types.ObjectId();
    const second = new Types.ObjectId();

    const changed = await repo.setDiscordName([first, second.toString()], "a#1");

    expect(changed).toBe(2);
    expect(model.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [first, second] } },
      { $set: { discordName: "a#1" } },
    );
  });

  it("writes nothing for an empty list", async () => {
    const { repo, model } = repository();

    expect(await repo.setDiscordName([], "a#1")).toBe(0);
    expect(model.updateMany).not.toHaveBeenCalled();
  });
});

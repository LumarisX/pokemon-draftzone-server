import { ErrorCodes } from "@core/pdz-error-codes";
import { Model, Types } from "mongoose";
import { TournamentApplicationRepository } from "./tournament-application.repository";
import { TournamentApplicationDocument } from "./tournament-application.schema";

function repositoryWhoseSaveFails(error: unknown) {
  const model = jest.fn().mockImplementation(() => ({
    save: jest.fn().mockRejectedValue(error),
  }));
  return new TournamentApplicationRepository(
    model as unknown as Model<TournamentApplicationDocument>,
  );
}

const input = {
  tournamentId: new Types.ObjectId(),
  auth0Id: "auth0|ash",
  name: "Ash",
  gameName: "AshK",
  discordName: "ash",
  timezone: "UTC",
  experience: "",
  droppedBefore: false,
  confirmed: true,
  preferredTeamName: "Team Rocket",
};

describe("TournamentApplicationRepository.create", () => {
  it("turns a duplicate-key error into ALREADY_SIGNED_UP", async () => {
    const repo = repositoryWhoseSaveFails({ code: 11000 });

    await expect(repo.create(input)).rejects.toMatchObject({
      code: ErrorCodes.LEAGUE.ALREADY_SIGNED_UP.code,
    });
  });

  it("passes any other error through", async () => {
    const failure = new Error("connection reset");
    const repo = repositoryWhoseSaveFails(failure);

    await expect(repo.create(input)).rejects.toBe(failure);
  });
});

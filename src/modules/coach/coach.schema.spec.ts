import { model, Types } from "mongoose";
import { CoachEntity, CoachSchema } from "./coach.schema";

const Coach = model(CoachEntity.name, CoachSchema);

function coach(overrides: Record<string, unknown> = {}) {
  return new Coach({
    auth0Id: "auth0|coach",
    name: "Misty",
    gameName: "Misty",
    discordName: "misty",
    timezone: "America/New_York",
    teamId: new Types.ObjectId(),
    ...overrides,
  });
}

describe("CoachSchema", () => {
  it("accepts a coach who left the experience question blank", () => {
    expect(coach({ experience: "" }).validateSync()).toBeUndefined();
  });

  it("accepts a coach whose sign-up had no experience question", () => {
    const doc = coach();
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.experience).toBe("");
  });

  it("still requires a game name", () => {
    expect(coach({ gameName: "" }).validateSync()?.errors).toHaveProperty(
      "gameName",
    );
  });
});

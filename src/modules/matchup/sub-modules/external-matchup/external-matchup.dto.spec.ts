import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ExternalMatchupDto } from "./external-matchup.dto";

describe("ExternalMatchupDto", () => {
  const basePayload = {
    stage: "Week 4",
    teamName: "Team Rocket",
    team: [{ id: "pikachu", name: "Pikachu" }],
  };

  async function validatePayload(payload: Record<string, unknown>) {
    const dto = plainToInstance(ExternalMatchupDto, payload);
    return validate(dto, { whitelist: true });
  }

  it("accepts a payload without a coach", async () => {
    const errors = await validatePayload(basePayload);
    expect(errors).toHaveLength(0);
  });

  it("accepts an empty-string coach as absent", async () => {
    const errors = await validatePayload({ ...basePayload, coach: "" });
    expect(errors).toHaveLength(0);
  });

  it("accepts a non-empty coach", async () => {
    const errors = await validatePayload({ ...basePayload, coach: "Wolfey" });
    expect(errors).toHaveLength(0);
  });

  it("rejects a missing teamName", async () => {
    const { teamName: _teamName, ...payload } = basePayload;
    const errors = await validatePayload(payload);
    expect(errors.map((e) => e.property)).toContain("teamName");
  });
});

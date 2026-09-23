import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { UpdateHostedTournamentSettingsDto } from "./hosted-tournament.dto";

function check(discordSettings: Record<string, unknown>) {
  const dto = plainToInstance(UpdateHostedTournamentSettingsDto, {
    discordSettings,
  });
  const errors = validateSync(dto, { whitelist: true });
  return { settings: dto.discordSettings, valid: errors.length === 0 };
}

describe("TournamentDiscordSettingsDto", () => {
  it("keeps autoGrantCoachRole through the whitelist", () => {
    expect(check({ autoGrantCoachRole: false })).toEqual({
      settings: expect.objectContaining({ autoGrantCoachRole: false }),
      valid: true,
    });
  });

  it("strips guildId, which only the /draftzone link command may set", () => {
    const { settings } = check({ guildId: "111111111111111111" });
    expect(settings).not.toHaveProperty("guildId");
  });

  it.each([{ coachRoleId: "@Coach" }, { signUpChannelId: "#sign-ups" }])(
    "rejects a non-snowflake id in %j",
    (settings) => {
      expect(check(settings).valid).toBe(false);
    },
  );
});

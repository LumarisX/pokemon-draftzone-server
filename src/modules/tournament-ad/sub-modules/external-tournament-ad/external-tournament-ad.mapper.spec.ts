import { ExternalTournamentAd } from "./external-tournament-ad.domain";
import { ExternalTournamentAdDto } from "./external-tournament-ad.dto";
import { ExternalTournamentAdMapper } from "./external-tournament-ad.mapper";
import { ExternalTournamentAdEntity } from "./external-tournament-ad.schema";

function buildAd(overrides: Partial<ConstructorParameters<typeof ExternalTournamentAd>[0]> = {}) {
  return new ExternalTournamentAd({
    leagueName: "Spring League",
    owner: "auth0|owner",
    description: "A friendly league",
    leagueDoc: "https://example.com/doc",
    serverLink: "https://discord.gg/abc",
    skillLevelRange: { from: "0", to: "1" },
    prizeValue: 2,
    platforms: ["Pokémon Showdown"],
    formats: ["Singles"],
    rulesets: ["Gen9 NatDex"],
    status: "Approved",
    signupLink: "https://example.com/signup",
    closesAt: new Date("2026-02-01"),
    seasonStart: new Date("2026-02-05"),
    seasonEnd: new Date("2026-04-05"),
    ...overrides,
  });
}

describe("ExternalTournamentAdMapper.toClientPayload", () => {
  it("exposes the ad's public-facing fields", () => {
    const ad = buildAd();

    expect(ExternalTournamentAdMapper.toClientPayload(ad)).toEqual({
      leagueName: "Spring League",
      owner: "auth0|owner",
      description: "A friendly league",
      leagueDoc: "https://example.com/doc",
      serverLink: "https://discord.gg/abc",
      skillLevelRange: { from: "0", to: "1" },
      prizeValue: 2,
      platforms: ["Pokémon Showdown"],
      formats: ["Singles"],
      rulesets: ["Gen9 NatDex"],
      status: "Approved",
      signupLink: "https://example.com/signup",
      closesAt: new Date("2026-02-01"),
      seasonStart: new Date("2026-02-05"),
      seasonEnd: new Date("2026-04-05"),
    });
  });

  it("doesn't expose the computed skillLevels/tags fields", () => {
    const ad = buildAd();

    const payload = ExternalTournamentAdMapper.toClientPayload(ad) as Record<string, unknown>;

    expect(payload.skillLevels).toBeUndefined();
    expect(payload.tags).toBeUndefined();
  });
});

describe("ExternalTournamentAdMapper.toDatabasePayload", () => {
  it("NOT YET IMPLEMENTED: always returns an empty object", () => {
    // Matches ExternalTournamentAdService.createExternalTournamentAd, which is
    // an explicit `//TODO: Build this service call` stub — nothing wires this
    // mapper method up to real field mapping yet.
    const ad = buildAd();

    expect(ExternalTournamentAdMapper.toDatabasePayload(ad)).toEqual({});
  });
});

describe("ExternalTournamentAdMapper.fromForm", () => {
  function buildDto(overrides: Partial<ExternalTournamentAdDto> = {}): ExternalTournamentAdDto {
    return {
      leagueName: "Spring League",
      description: "A friendly league",
      skillLevelRange: { from: "0", to: "1" },
      prizeValue: 2,
      platforms: ["Pokémon Showdown"],
      formats: ["Singles"],
      rulesets: ["Gen9 NatDex"],
      signupLink: "https://example.com/signup",
      closesAt: new Date("2026-02-01"),
      ...overrides,
    } as ExternalTournamentAdDto;
  }

  it("builds an ExternalTournamentAd from the submitted form, using the given owner", () => {
    const dto = buildDto();

    const result = ExternalTournamentAdMapper.fromForm(dto, "auth0|owner-2");

    expect(result).toBeInstanceOf(ExternalTournamentAd);
    expect(result.owner).toBe("auth0|owner-2");
    expect(result.leagueName).toBe("Spring League");
    expect(result.prizeValue).toBe(2);
    expect(result.skillLevels).toEqual([0, 1]);
  });
});

describe("ExternalTournamentAdMapper.fromDatabase", () => {
  function buildEntity(overrides: Partial<ExternalTournamentAdEntity> = {}): ExternalTournamentAdEntity {
    return {
      leagueName: "Spring League",
      owner: "auth0|owner",
      description: "A friendly league",
      leagueDoc: "",
      serverLink: "",
      skillLevelRange: { from: "0", to: "1" },
      prizeValue: "2",
      platforms: ["Pokémon Showdown"],
      formats: ["Singles"],
      rulesets: ["Gen9 NatDex"],
      signupLink: "https://example.com/signup",
      status: "Approved",
      closesAt: new Date("2026-02-01"),
      ...overrides,
    } as ExternalTournamentAdEntity;
  }

  it("builds an ExternalTournamentAd from the persisted entity", () => {
    const entity = buildEntity();

    const result = ExternalTournamentAdMapper.fromDatabase(entity);

    expect(result).toBeInstanceOf(ExternalTournamentAd);
    expect(result.owner).toBe("auth0|owner");
    expect(result.prizeValue).toBe(2);
    expect(result.skillLevels).toEqual([0, 1]);
    expect(result.status).toBe("Approved");
  });
});

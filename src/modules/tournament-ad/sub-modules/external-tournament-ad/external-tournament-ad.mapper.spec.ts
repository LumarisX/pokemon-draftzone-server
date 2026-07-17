import { Types } from "mongoose";
import { ExternalTournamentAd } from "./external-tournament-ad.domain";
import { ExternalTournamentAdDto } from "./external-tournament-ad.dto";
import { ExternalTournamentAdMapper } from "./external-tournament-ad.mapper";
import { ExternalTournamentAdDocument } from "./external-tournament-ad.schema";

function buildAd(overrides: Partial<ConstructorParameters<typeof ExternalTournamentAd>[0]> = {}) {
  return new ExternalTournamentAd({
    _id: "656e1f77a0f1b2c3d4e5f601",
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
      _id: "656e1f77a0f1b2c3d4e5f601",
      leagueName: "Spring League",
      owner: "auth0|owner",
      description: "A friendly league",
      leagueDoc: "https://example.com/doc",
      serverLink: "https://discord.gg/abc",
      skillLevelRange: { from: "0", to: "1" },
      skillLevels: [0, 1],
      prizeValue: 2,
      platforms: ["Pokémon Showdown"],
      formats: ["Singles"],
      rulesets: ["Gen9 NatDex"],
      tags: ad.tags,
      status: "Approved",
      signupLink: "https://example.com/signup",
      closesAt: new Date("2026-02-01"),
      seasonStart: new Date("2026-02-05"),
      seasonEnd: new Date("2026-04-05"),
    });
  });

  it("exposes the computed skillLevels/tags fields used by the client", () => {
    const ad = buildAd();

    const payload = ExternalTournamentAdMapper.toClientPayload(ad);

    expect(payload.skillLevels).toEqual([0, 1]);
    expect(payload.tags).toEqual(expect.arrayContaining(["prize", "ps", "poke", "great"]));
  });
});

describe("ExternalTournamentAdMapper.toDatabasePayload", () => {
  it("maps the domain ad to the persisted entity shape", () => {
    const ad = buildAd();

    expect(ExternalTournamentAdMapper.toDatabasePayload(ad)).toEqual({
      leagueName: "Spring League",
      owner: "auth0|owner",
      description: "A friendly league",
      leagueDoc: "https://example.com/doc",
      serverLink: "https://discord.gg/abc",
      skillLevelRange: { from: "0", to: "1" },
      prizeValue: "2",
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
  function buildEntity(
    overrides: Partial<ExternalTournamentAdDocument> = {},
  ): ExternalTournamentAdDocument {
    return {
      _id: new Types.ObjectId("656e1f77a0f1b2c3d4e5f601"),
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
    } as ExternalTournamentAdDocument;
  }

  it("builds an ExternalTournamentAd from the persisted entity", () => {
    const entity = buildEntity();

    const result = ExternalTournamentAdMapper.fromDatabase(entity);

    expect(result).toBeInstanceOf(ExternalTournamentAd);
    expect(result._id).toBe("656e1f77a0f1b2c3d4e5f601");
    expect(result.owner).toBe("auth0|owner");
    expect(result.prizeValue).toBe(2);
    expect(result.skillLevels).toEqual([0, 1]);
    expect(result.status).toBe("Approved");
  });
});

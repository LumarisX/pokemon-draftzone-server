import { SaveTeamDto } from "./teambuilder-team.dto";
import { TeambuilderTeamRepository } from "./teambuilder-team.repository";
import { TeambuilderTeamService } from "./teambuilder-team.service";
import { TEAM_MAX_SETS } from "./teambuilder-team.schema";

function setDto(overrides: Record<string, unknown> = {}) {
  const zero = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  return {
    id: "pikachu",
    level: 100,
    gender: "" as const,
    shiny: false,
    ability: "static",
    moves: ["thunderbolt", null, null, null],
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    evs: { ...zero },
    sps: { ...zero },
    happiness: 255,
    dynamaxLevel: 10,
    gigantamax: false,
    ...overrides,
  };
}

function teamDoc(overrides: Record<string, unknown> = {}) {
  return {
    slug: "abc123",
    userSub: "auth0|1",
    context: { type: "matchup", id: "m1" },
    name: "",
    ruleset: "Gen9 NatDex",
    level: 100,
    sets: [setDto()],
    ...overrides,
  } as any;
}

describe("TeambuilderTeamService", () => {
  let repo: jest.Mocked<TeambuilderTeamRepository>;
  let service: TeambuilderTeamService;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findByContext: jest.fn(),
      findBySlug: jest.fn(),
      upsertBySlug: jest.fn(),
      deleteBySlug: jest.fn(),
    } as unknown as jest.Mocked<TeambuilderTeamRepository>;
    service = new TeambuilderTeamService(repo);
  });

  describe("listByContext", () => {
    it("scopes the lookup to the user and context", async () => {
      repo.findByContext.mockResolvedValue([teamDoc()]);

      const teams = await service.listByContext("auth0|1", "matchup", "m1");

      expect(repo.findByContext).toHaveBeenCalledWith(
        "auth0|1",
        "matchup",
        "m1",
      );
      expect(teams).toHaveLength(1);
      expect(teams[0].slug).toBe("abc123");
    });

    it("reports legality issues per set", async () => {
      repo.findByContext.mockResolvedValue([
        teamDoc({
          sets: [
            setDto({
              evs: { hp: 6, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
            }),
          ],
        }),
      ]);

      const [team] = await service.listByContext("auth0|1", "matchup", "m1");

      expect(team.issues[0].issues.map((issue) => issue.code)).toContain(
        "points.wasted",
      );
    });

    it("falls back to default stat rules for an unknown ruleset", async () => {
      repo.findByContext.mockResolvedValue([
        teamDoc({ ruleset: "Not A Ruleset" }),
      ]);

      await expect(
        service.listByContext("auth0|1", "matchup", "m1"),
      ).resolves.toHaveLength(1);
    });
  });

  describe("get", () => {
    it("throws TEAM_NOT_FOUND when the slug is not the user's", async () => {
      repo.findBySlug.mockResolvedValue(null);

      await expect(service.get("auth0|1", "nope")).rejects.toMatchObject({
        code: "TB-001",
      });
    });
  });

  describe("save", () => {
    const dto = (): SaveTeamDto =>
      ({
        context: { type: "matchup", id: "m1" },
        ruleset: "Gen9 NatDex",
        level: 100,
        sets: [setDto()],
      }) as unknown as SaveTeamDto;

    it("upserts under the caller's sub", async () => {
      repo.upsertBySlug.mockResolvedValue(teamDoc());

      await service.save("auth0|1", "abc123", dto());

      expect(repo.upsertBySlug).toHaveBeenCalledWith(
        "auth0|1",
        "abc123",
        expect.objectContaining({
          ruleset: "Gen9 NatDex",
          context: { type: "matchup", id: "m1" },
        }),
      );
    });

    it("rejects a team over the set limit", async () => {
      const tooMany = dto();
      tooMany.sets = Array.from({ length: TEAM_MAX_SETS + 1 }, () =>
        setDto(),
      ) as any;

      await expect(
        service.save("auth0|1", "abc123", tooMany),
      ).rejects.toMatchObject({ code: "TB-002" });
      expect(repo.upsertBySlug).not.toHaveBeenCalled();
    });

    it("lets the server mint the slug on create", async () => {
      repo.create.mockResolvedValue(teamDoc());

      const team = await service.create("auth0|1", dto());

      expect(repo.create).toHaveBeenCalledWith(
        "auth0|1",
        expect.objectContaining({ ruleset: "Gen9 NatDex" }),
      );
      expect(team.slug).toBe("abc123");
    });

    it("rejects an unknown ruleset before writing", async () => {
      const bad = dto();
      bad.ruleset = "Not A Ruleset";

      await expect(service.save("auth0|1", "abc123", bad)).rejects.toBeDefined();
      expect(repo.upsertBySlug).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("throws when nothing was deleted", async () => {
      repo.deleteBySlug.mockResolvedValue(false);

      await expect(service.remove("auth0|1", "abc123")).rejects.toMatchObject({
        code: "TB-001",
      });
    });

    it("resolves when a team was deleted", async () => {
      repo.deleteBySlug.mockResolvedValue(true);

      await expect(service.remove("auth0|1", "abc123")).resolves.toBeUndefined();
    });
  });
});

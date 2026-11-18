import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { UserService } from "@modules/user/user.service";
import { PublicProfileController } from "./public-profile.controller";
import { ProfileService } from "./profile.service";

const OWNER = "account-owner";
const STRANGER = "account-stranger";
const PROFILE_ID = "0123456789abcdef01234567";

function card(overrides: Record<string, unknown> = {}) {
  return {
    accountId: OWNER,
    profileId: PROFILE_ID,
    displayName: "Ash",
    username: "ash",
    joined: new Date("2026-01-01T00:00:00.000Z"),
    privateProfile: false,
    ...overrides,
  };
}

function season(overrides: Record<string, unknown> = {}) {
  return {
    phase: "completed",
    completedAt: new Date("2026-05-01T00:00:00.000Z"),
    completedByOrganizer: true,
    outcome: {
      placement: 1,
      of: 8,
      label: "Champion",
      champion: true,
      achievements: [{ id: "victor", rarity: "bronze" }],
    },
    teamName: "Rockets",
    tournamentName: "Spring Cup",
    logo: null,
    leagueName: "Kanto League",
    leagueSlug: "kanto",
    tournamentSlug: "spring-cup",
    teamSlug: "rockets",
    teamId: "team-1",
    draft: [{ id: "pikachu", name: "Pikachu" }],
    score: { wins: 6, draws: 0, losses: 1, diff: 4 },
    ...overrides,
  };
}

const PROFILE_KEYS = ["achievements", "career", "completed"];
const RESPONSE_KEYS = [
  "displayName",
  "isYou",
  "joined",
  "private",
  "profile",
  "profileId",
];

describe("ProfileService public profiles", () => {
  let seasons: { hosted: jest.Mock };
  let externalRepo: { findByOwner: jest.Mock; findCompletedByOwner: jest.Mock };
  let archiveRepo: { findAllByOwner: jest.Mock };
  let users: { findPublicCard: jest.Mock };
  let service: ProfileService;

  beforeEach(() => {
    seasons = {
      hosted: jest.fn().mockResolvedValue({
        tournaments: [
          season(),
          season({
            teamId: "team-2",
            teamSlug: "live",
            phase: "season",
            completedAt: null,
            completedByOrganizer: false,
            outcome: null,
            score: { wins: 2, draws: 0, losses: 0, diff: 3 },
          }),
          season({
            teamId: "team-3",
            teamSlug: "self-completed",
            completedByOrganizer: false,
            outcome: null,
            score: { wins: 3, draws: 0, losses: 3, diff: 0 },
          }),
        ],
        organizing: [],
        completedCount: 2,
      }),
    };
    externalRepo = {
      findByOwner: jest.fn().mockResolvedValue([]),
      findCompletedByOwner: jest.fn().mockResolvedValue([
        {
          slug: "ext-1",
          teamName: "Private Squad",
          leagueName: "Friends League",
          team: [],
          completedAt: new Date("2026-04-01T00:00:00.000Z"),
          getScore: () => ({ wins: 9, losses: 0 }),
        },
      ]),
    };
    archiveRepo = { findAllByOwner: jest.fn().mockResolvedValue([]) };
    users = { findPublicCard: jest.fn().mockResolvedValue(card()) };
    service = new ProfileService(
      seasons as any,
      externalRepo as any,
      archiveRepo as any,
      users as unknown as UserService,
    );
  });

  it("returns exactly the documented keys for a public profile", async () => {
    const result = await service.getPublicProfile(PROFILE_ID, undefined);

    expect(Object.keys(result).sort()).toEqual(RESPONSE_KEYS);
    expect(Object.keys(result.profile!).sort()).toEqual(PROFILE_KEYS);
    expect(result).toMatchObject({
      profileId: PROFILE_ID,
      displayName: "Ash",
      joined: "2026-01-01T00:00:00.000Z",
      private: false,
      isYou: false,
    });
  });

  it("never carries an account id, names, timezone or roles", async () => {
    const result = await service.getPublicProfile(PROFILE_ID, STRANGER);

    const text = JSON.stringify(result);
    expect(text).not.toContain(OWNER);
    expect(text).not.toContain(STRANGER);
    for (const key of ["sub", "discordName", "gameName", "timezone", "roles"]) {
      expect(text).not.toContain(`"${key}"`);
    }
  });

  it("falls back to the username, then a generic name, when there is no display name", async () => {
    users.findPublicCard.mockResolvedValue(
      card({ displayName: null, username: "Misty" }),
    );
    expect(
      (await service.getPublicProfile(PROFILE_ID, undefined)).displayName,
    ).toBe("Misty");

    users.findPublicCard.mockResolvedValue(
      card({ displayName: null, username: null }),
    );
    expect(
      (await service.getPublicProfile(PROFILE_ID, undefined)).displayName,
    ).toBe("Coach");
  });

  it("passes the id through to the lookup untouched", async () => {
    await service.getPublicProfile("  ASH ", undefined);

    expect(users.findPublicCard).toHaveBeenCalledWith("  ASH ");
  });

  it("propagates account not found", async () => {
    users.findPublicCard.mockRejectedValue(
      new PDZError(ErrorCodes.USER.ACCOUNT_NOT_FOUND),
    );

    await expect(
      service.getPublicProfile("nobody", undefined),
    ).rejects.toMatchObject({ code: "USR-010", status: 404 });
  });

  it("shows a stranger only seasons the organizer completed, hosted only", async () => {
    const { profile } = await service.getPublicProfile(PROFILE_ID, STRANGER);

    expect(profile!.completed.map((entry) => entry.id)).toEqual([
      "hosted:team-1",
    ]);
    expect(profile!.completed.every((entry) => entry.kind === "hosted")).toBe(
      true,
    );
    expect(profile!.career).toMatchObject({
      seasons: 1,
      wins: 6,
      losses: 1,
      titles: 1,
    });
    expect(profile!.achievements.map((entry) => entry.id)).toEqual(["victor"]);
  });

  it("does not read external drafts or archives for a stranger", async () => {
    await service.getPublicProfile(PROFILE_ID, STRANGER);
    await service.getPublicProfile(PROFILE_ID, undefined);

    expect(externalRepo.findByOwner).not.toHaveBeenCalled();
    expect(externalRepo.findCompletedByOwner).not.toHaveBeenCalled();
    expect(archiveRepo.findAllByOwner).not.toHaveBeenCalled();
  });

  it("shows the owner the same thing GET /profile shows", async () => {
    const result = await service.getPublicProfile(PROFILE_ID, OWNER);
    const own = await service.getProfile(OWNER);

    expect(result.isYou).toBe(true);
    expect(result.profile).toEqual(own);
    expect(result.profile!.completed.map((entry) => entry.id).sort()).toEqual([
      "external:ext-1",
      "hosted:team-1",
      "hosted:team-3",
    ]);
    expect(result.profile!.career.seasons).toBe(4);
    expect(externalRepo.findCompletedByOwner).toHaveBeenCalledWith(OWNER);
  });

  it("returns a null profile for a private account to a stranger and a signed-out caller", async () => {
    users.findPublicCard.mockResolvedValue(card({ privateProfile: true }));

    for (const viewer of [STRANGER, undefined]) {
      const result = await service.getPublicProfile(PROFILE_ID, viewer);

      expect(Object.keys(result).sort()).toEqual(RESPONSE_KEYS);
      expect(result).toMatchObject({
        private: true,
        isYou: false,
        profile: null,
        profileId: PROFILE_ID,
        displayName: "Ash",
      });
    }
    expect(seasons.hosted).not.toHaveBeenCalled();
  });

  it("gives the owner of a private profile the full profile with private still true", async () => {
    users.findPublicCard.mockResolvedValue(card({ privateProfile: true }));

    const result = await service.getPublicProfile(PROFILE_ID, OWNER);

    expect(result.private).toBe(true);
    expect(result.isYou).toBe(true);
    expect(result.profile).toEqual(await service.getProfile(OWNER));
  });
});

describe("PublicProfileController", () => {
  it("forwards the id and the optional viewer", async () => {
    const profileService = {
      getPublicProfile: jest.fn().mockResolvedValue({ profileId: PROFILE_ID }),
    } as unknown as jest.Mocked<ProfileService>;
    const controller = new PublicProfileController(profileService);

    await controller.getPublicProfile(PROFILE_ID, undefined);
    await controller.getPublicProfile(PROFILE_ID, STRANGER);

    expect(profileService.getPublicProfile).toHaveBeenNthCalledWith(
      1,
      PROFILE_ID,
      undefined,
    );
    expect(profileService.getPublicProfile).toHaveBeenNthCalledWith(
      2,
      PROFILE_ID,
      STRANGER,
    );
  });

  it("serves the route as :id", () => {
    const handler = PublicProfileController.prototype.getPublicProfile;

    expect(Reflect.getMetadata("path", handler)).toBe(":id");
  });

  it("allows signed-out callers and throttles 60 a minute by IP", () => {
    const handler = PublicProfileController.prototype.getPublicProfile;

    expect(Reflect.getMetadata("isOptionalAuth", PublicProfileController)).toBe(
      true,
    );
    expect(Reflect.getMetadata("THROTTLER:LIMITdefault", handler)).toBe(60);
    expect(Reflect.getMetadata("THROTTLER:TTLdefault", handler)).toBe(60_000);
    expect(Reflect.getMetadata("__guards__", handler)).toBeUndefined();
  });
});

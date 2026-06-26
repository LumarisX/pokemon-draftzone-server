import { Auth0UserDto, UserSettingsDto } from "./user.dto";
import { User, UserSettings } from "./user.domain";
import { UserMapper, UserSettingsMapper } from "./user.mapper";
import { UserEntity, UserSettingsEntity } from "./user.schema";

describe("UserMapper.toClientPayload", () => {
  it("exposes sub/settings/joined/lastLogin/lastCheckedAdsAt", () => {
    const joined = new Date("2026-01-01");
    const lastLogin = new Date("2026-02-01");
    const lastCheckedAdsAt = new Date("2026-02-10");
    const settings = new UserSettings({ theme: "dark" });
    const user = new User({ sub: "auth0|user-1", joined, lastLogin, settings, lastCheckedAdsAt });

    expect(UserMapper.toClientPayload(user)).toEqual({
      sub: "auth0|user-1",
      settings,
      joined,
      lastLogin,
      lastCheckedAdsAt,
    });
  });
});

describe("UserMapper.fromAuth0", () => {
  function buildAuth0Dto(overrides: Partial<Auth0UserDto> = {}): Auth0UserDto {
    return {
      auth0Sub: "auth0|user-1",
      lastLogin: "2026-02-01T00:00:00.000Z",
      joined: "2026-01-01T00:00:00.000Z",
      settings: {},
      username: "ash",
      emailVerified: true,
      ...overrides,
    } as Auth0UserDto;
  }

  it("parses the auth0Sub, username, joined, and lastLogin fields into a User", () => {
    const result = UserMapper.fromAuth0(buildAuth0Dto());

    expect(result).toBeInstanceOf(User);
    expect(result.sub).toBe("auth0|user-1");
    expect(result.username).toBe("ash");
    expect(result.joined).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(result.lastLogin).toEqual(new Date("2026-02-01T00:00:00.000Z"));
  });

  it("doesn't carry over settings from the Auth0 payload", () => {
    const result = UserMapper.fromAuth0(
      buildAuth0Dto({ settings: { theme: "dark" } }),
    );

    expect(result.settings).toBeUndefined();
  });
});

describe("UserMapper.fromDatabase", () => {
  function buildEntity(overrides: Partial<UserEntity> = {}): UserEntity {
    return {
      auth0Sub: "auth0|user-1",
      joined: new Date("2026-01-01"),
      lastLogin: new Date("2026-02-01"),
      lastCheckedAdsAt: new Date("2026-02-10"),
      settings: { shinyUnlock: true, spriteSet: "showdown" } as UserSettingsEntity,
      ...overrides,
    } as UserEntity;
  }

  it("maps every field, including nested settings", () => {
    const entity = buildEntity();

    const result = UserMapper.fromDatabase(entity);

    expect(result).toBeInstanceOf(User);
    expect(result.sub).toBe("auth0|user-1");
    expect(result.joined).toEqual(entity.joined);
    expect(result.lastLogin).toEqual(entity.lastLogin);
    expect(result.lastCheckedAdsAt).toEqual(entity.lastCheckedAdsAt);
    expect(result.settings).toEqual(
      new UserSettings({ shinyUnlock: true, spriteSet: "showdown" }),
    );
  });

  it("defaults settings to an empty UserSettings when the entity has none", () => {
    const result = UserMapper.fromDatabase(buildEntity({ settings: undefined as any }));

    expect(result.settings).toEqual(new UserSettings());
  });
});

describe("UserSettingsMapper.toDatabasePayload", () => {
  it("extracts the five known settings fields", () => {
    const settings = new UserSettings({
      shinyUnlock: false,
      spriteSet: "home",
      theme: "classic",
      ldMode: "device",
      themeOverride: "custom",
    });

    expect(UserSettingsMapper.toDatabasePayload(settings)).toEqual({
      shinyUnlock: false,
      spriteSet: "home",
      theme: "classic",
      ldMode: "device",
      themeOverride: "custom",
    });
  });
});

describe("UserSettingsMapper.toClientPayload", () => {
  it("fills in sensible defaults for every unset field", () => {
    const result = UserSettingsMapper.toClientPayload(new UserSettings());

    expect(result).toEqual({
      shinyUnlock: true,
      spriteSet: "home",
      theme: "classic",
      ldMode: "device",
      themeOverride: null,
    });
  });

  it("preserves explicitly set values instead of the defaults", () => {
    const settings = new UserSettings({
      shinyUnlock: false,
      spriteSet: "showdown",
      theme: "dark",
      ldMode: "dark",
      themeOverride: "custom",
    });

    expect(UserSettingsMapper.toClientPayload(settings)).toEqual({
      shinyUnlock: false,
      spriteSet: "showdown",
      theme: "dark",
      ldMode: "dark",
      themeOverride: "custom",
    });
  });

  it("normalizes an empty-string themeOverride to null", () => {
    const settings = new UserSettings({ themeOverride: "" });

    expect(UserSettingsMapper.toClientPayload(settings).themeOverride).toBeNull();
  });
});

describe("UserSettingsMapper.fromForm", () => {
  function buildDto(overrides: Partial<UserSettingsDto> = {}): UserSettingsDto {
    return {
      shinyUnlock: false,
      spriteSet: "showdown",
      theme: "dark",
      ldMode: "dark",
      themeOverride: "custom",
      ...overrides,
    };
  }

  it("builds a UserSettings from the submitted form fields", () => {
    const result = UserSettingsMapper.fromForm(buildDto());

    expect(result).toEqual(
      new UserSettings({
        shinyUnlock: false,
        spriteSet: "showdown",
        theme: "dark",
        ldMode: "dark",
        themeOverride: "custom",
      }),
    );
  });
});

describe("UserSettingsMapper.fromDatabase", () => {
  it("maps the five known fields from the entity", () => {
    const entity: UserSettingsEntity = {
      shinyUnlock: true,
      spriteSet: "home",
      theme: "classic",
      ldMode: "device",
      themeOverride: "custom",
    };

    expect(UserSettingsMapper.fromDatabase(entity)).toEqual(
      new UserSettings(entity),
    );
  });

  it("returns an empty UserSettings when the entity is missing entirely", () => {
    expect(UserSettingsMapper.fromDatabase(undefined as any)).toEqual(
      new UserSettings(),
    );
  });
});

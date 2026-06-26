import { User, UserSettings } from "./user.domain";

describe("UserSettings", () => {
  it("copies provided fields", () => {
    const settings = new UserSettings({
      shinyUnlock: true,
      spriteSet: "showdown",
      theme: "dark",
      ldMode: "dark",
      themeOverride: "custom",
    });

    expect(settings).toEqual({
      shinyUnlock: true,
      spriteSet: "showdown",
      theme: "dark",
      ldMode: "dark",
      themeOverride: "custom",
    });
  });

  it("defaults to an empty object when constructed with no init", () => {
    const settings = new UserSettings();

    expect(settings).toEqual({});
  });
});

describe("User", () => {
  it("copies all constructor fields, including optional ones", () => {
    const joined = new Date("2026-01-01");
    const lastLogin = new Date("2026-02-01");
    const lastCheckedAdsAt = new Date("2026-02-10");
    const settings = new UserSettings({ theme: "dark" });

    const user = new User({
      sub: "auth0|user-1",
      joined,
      lastLogin,
      settings,
      lastCheckedAdsAt,
    });

    expect(user.sub).toBe("auth0|user-1");
    expect(user.joined).toBe(joined);
    expect(user.lastLogin).toBe(lastLogin);
    expect(user.settings).toBe(settings);
    expect(user.lastCheckedAdsAt).toBe(lastCheckedAdsAt);
  });

  it("leaves settings/lastCheckedAdsAt undefined when omitted", () => {
    const user = new User({
      sub: "auth0|user-1",
      joined: new Date("2026-01-01"),
      lastLogin: new Date("2026-02-01"),
    });

    expect(user.settings).toBeUndefined();
    expect(user.lastCheckedAdsAt).toBeUndefined();
  });
});

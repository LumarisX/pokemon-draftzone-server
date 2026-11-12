import {
  IDENTITY_PACKS,
  findIdentity,
  identityCatalog,
  identityLogoKey,
  resolveIdentity,
} from "./catalog";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const comparable = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, "");

describe("identity catalog", () => {
  const identities = IDENTITY_PACKS.flatMap((pack) => pack.identities);

  it("gives every pack and identity a slug id", () => {
    for (const pack of IDENTITY_PACKS) expect(pack.id).toMatch(SLUG);
    for (const identity of identities) expect(identity.id).toMatch(SLUG);
  });

  it("never repeats a pack id", () => {
    const ids = IDENTITY_PACKS.map((pack) => pack.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never repeats an identity id or name across packs", () => {
    expect(new Set(identities.map((identity) => identity.id)).size).toBe(
      identities.length,
    );
    expect(
      new Set(identities.map((identity) => comparable(identity.name))).size,
    ).toBe(identities.length);
  });

  it("ships the sixteen starter identities", () => {
    expect(
      IDENTITY_PACKS.find((pack) => pack.id === "starter")?.identities,
    ).toHaveLength(16);
  });

  it("finds an identity by pack and id", () => {
    expect(findIdentity("starter", "miami-palafins")?.name).toBe(
      "Miami Palafins",
    );
    expect(findIdentity("starter", "missing")).toBeUndefined();
    expect(findIdentity("missing", "miami-palafins")).toBeUndefined();
  });

  it("resolves an identity to the name and logo a team takes", () => {
    expect(resolveIdentity("starter", "okc-thundurus")).toEqual({
      name: "OKC Thundurus",
      logo: "logo-packs/starter/okc-thundurus.webp",
    });
    expect(resolveIdentity("starter", "../team-logos/x")).toBeUndefined();
  });

  it("serves each identity with its logo key", () => {
    const starter = identityCatalog().find((pack) => pack.id === "starter");
    expect(starter?.identities[0]).toEqual({
      id: "seafoam-blue-jays",
      name: "Seafoam Blue Jays",
      logo: identityLogoKey("starter", "seafoam-blue-jays"),
    });
    expect(identityLogoKey("starter", "seafoam-blue-jays")).toBe(
      "logo-packs/starter/seafoam-blue-jays.webp",
    );
  });
});

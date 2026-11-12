export interface TeamIdentity {
  id: string;
  name: string;
}

export interface IdentityPack {
  id: string;
  name: string;
  identities: readonly TeamIdentity[];
}

export interface IdentityPackView {
  id: string;
  name: string;
  identities: { id: string; name: string; logo: string }[];
}

export const IDENTITY_PACKS: readonly IdentityPack[] = [
  {
    id: "starter",
    name: "Starter Pack",
    identities: [
      { id: "seafoam-blue-jays", name: "Seafoam Blue Jays" },
      { id: "new-york-hariyamas", name: "New York Hariyamas" },
      { id: "chicago-cubchoos", name: "Chicago Cubchoos" },
      { id: "detroit-dratinis", name: "Detroit Dratinis" },
      { id: "cerulean-cowboys", name: "Cerulean Cowboys" },
      { id: "miami-palafins", name: "Miami Palafins" },
      { id: "carolina-umbreons", name: "Carolina Umbreons" },
      { id: "atlanta-ho-ohs", name: "Atlanta Ho-ohs" },
      { id: "okc-thundurus", name: "OKC Thundurus" },
      { id: "lumiose-suns", name: "Lumiose Suns" },
      { id: "sinnoh-jazz", name: "Sinnoh Jazz" },
      { id: "azalea-kings", name: "Azalea Kings" },
      { id: "calgary-flamebodies", name: "Calgary Flamebodies" },
      { id: "colorado-lapras", name: "Colorado Lapras" },
      { id: "st-louis-kingdras", name: "St. Louis Kingdras" },
      { id: "minnesota-vileplume", name: "Minnesota Vileplume" },
    ],
  },
];

export function identityLogoKey(packId: string, identityId: string): string {
  return `logo-packs/${packId}/${identityId}.webp`;
}

export function findIdentity(
  packId: string,
  identityId: string,
): TeamIdentity | undefined {
  return IDENTITY_PACKS.find((pack) => pack.id === packId)?.identities.find(
    (identity) => identity.id === identityId,
  );
}

export function resolveIdentity(
  packId: string,
  identityId: string,
): { name: string; logo: string } | undefined {
  const identity = findIdentity(packId, identityId);
  return identity
    ? { name: identity.name, logo: identityLogoKey(packId, identity.id) }
    : undefined;
}

export function identityCatalog(): IdentityPackView[] {
  return IDENTITY_PACKS.map((pack) => ({
    id: pack.id,
    name: pack.name,
    identities: pack.identities.map((identity) => ({
      id: identity.id,
      name: identity.name,
      logo: identityLogoKey(pack.id, identity.id),
    })),
  }));
}

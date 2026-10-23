import { getFormat, Format } from "@core/data/formats/formats";
import { getRuleset, Ruleset } from "@core/data/rulesets/rulesets";
import { Types } from "mongoose";
import { TierListRole, TierListVisibility } from "./tier-list.schema";

export const UNTIERED_TIER_NAME = "Untiered";
export const BANNED_TIER_NAME = "Banned";

export class TierListPokemonAddon {
  name: string;
  cost: number;
  notes?: string;

  constructor(props: { name: string; cost: number; notes?: string }) {
    this.name = props.name;
    this.cost = props.cost;
    this.notes = props.notes;
  }
}

export class TierListPokemon {
  name: string;
  tierId?: string;
  notes?: string;
  addons?: TierListPokemonAddon[];
  banned?: boolean;
  formes?: string[];

  constructor(props: {
    name: string;
    tierId?: string;
    notes?: string;
    addons?: TierListPokemonAddon[];
    banned?: boolean;
    formes?: string[];
  }) {
    this.name = props.name;
    this.tierId = props.tierId;
    this.notes = props.notes;
    this.addons = props.addons;
    this.banned = props.banned;
    this.formes = props.formes;
  }
}

export class Tier {
  id: string;
  name: string;
  cost: number;
  color?: string;

  constructor(props: {
    id: string;
    name: string;
    cost: number;
    color?: string;
  }) {
    this.id = props.id;
    this.name = props.name;
    this.cost = props.cost;
    this.color = props.color;
  }
}

export class DraftCount {
  min: number;
  max: number;

  constructor(props: { min: number; max: number }) {
    this.min = props.min;
    this.max = props.max;
  }
}

export type TierListMember = {
  sub: string;
  name?: string;
  role: TierListRole;
};

export type TierListAccess = "manage" | "edit" | "view" | "none";

export function upstreamOf(source: {
  id: string;
  version: number;
  tournamentId?: string;
  copiedFrom?: string;
  copiedFromVersion?: number;
}): { id: string; version?: number } {
  if (source.tournamentId && source.copiedFrom)
    return { id: source.copiedFrom, version: source.copiedFromVersion };
  return { id: source.id, version: source.version };
}

export type ClientTierPokemonInput = {
  id: string;
  name: string;
  banned?: boolean;
  notes?: string;
  bannedAbilities?: string[];
  formes?: string[];
};

export type ClientTierInput = {
  id?: string;
  name: string;
  cost: number;
  pokemon: ClientTierPokemonInput[];
};

export class TierList {
  id: string;
  slug: string;
  name: string;
  description?: string;
  createdBy: string;
  authorName?: string;
  copiedFrom?: string;
  copiedFromVersion?: number;
  tournamentId?: string;
  retiredAt?: Date;
  pokemon: Map<string, TierListPokemon>;
  tiers: Tier[];
  banned: { moves: string[]; abilities: string[] };
  format: Format;
  ruleset: Ruleset;
  visibility: TierListVisibility;
  members: TierListMember[];
  tags: string[];
  featured: boolean;
  version: number;
  forkCount: number;
  useCount: number;
  updatedAt?: Date;

  constructor(props: {
    id: string;
    slug: string;
    name: string;
    description?: string;
    createdBy: string;
    authorName?: string;
    copiedFrom?: string;
    copiedFromVersion?: number;
    tournamentId?: string;
    retiredAt?: Date;
    pokemon: Map<string, TierListPokemon>;
    tiers: Tier[];
    banned: { moves: string[]; abilities: string[] };
    format: string;
    ruleset: string;
    visibility?: TierListVisibility;
    members?: TierListMember[];
    tags?: string[];
    featured?: boolean;
    version?: number;
    forkCount?: number;
    useCount?: number;
    updatedAt?: Date;
  }) {
    this.id = props.id;
    this.slug = props.slug;
    this.name = props.name;
    this.description = props.description;
    this.createdBy = props.createdBy;
    this.authorName = props.authorName;
    this.copiedFrom = props.copiedFrom;
    this.copiedFromVersion = props.copiedFromVersion;
    this.tournamentId = props.tournamentId;
    this.retiredAt = props.retiredAt;
    this.pokemon = props.pokemon;
    this.tiers = props.tiers;
    this.banned = props.banned;
    this.format = getFormat(props.format);
    this.ruleset = getRuleset(props.ruleset);
    this.visibility = props.visibility ?? "private";
    this.members = props.members ?? [];
    this.tags = props.tags ?? [];
    this.featured = props.featured ?? false;
    this.version = props.version ?? 0;
    this.forkCount = props.forkCount ?? 0;
    this.useCount = props.useCount ?? 0;
    this.updatedAt = props.updatedAt;
  }

  get isTournamentCopy(): boolean {
    return !!this.tournamentId;
  }

  memberRole(sub: string | undefined): TierListRole | null {
    if (!sub) return null;
    return this.members.find((member) => member.sub === sub)?.role ?? null;
  }

  presetAccess(sub: string | undefined): TierListAccess {
    if (sub && this.createdBy === sub) return "manage";
    const role = this.memberRole(sub);
    if (role === "editor") return "edit";
    if (role === "viewer") return "view";
    return this.visibility === "private" ? "none" : "view";
  }

  getTierById(tierId: string | undefined): Tier | undefined {
    if (!tierId) return undefined;
    return this.tiers.find((tier) => tier.id === tierId);
  }

  getPokemonTier(pokemonId: string): Tier | undefined {
    return this.getTierById(this.pokemon.get(pokemonId)?.tierId);
  }

  hasPokemon(pokemonId: string): boolean {
    return this.pokemon.has(pokemonId);
  }

  getPokemonCost(pokemonId: string, addonNames?: string[]): number | undefined {
    const pokemon = this.pokemon.get(pokemonId);
    if (!pokemon) return undefined;

    if (addonNames?.length && pokemon.addons) {
      const addon = pokemon.addons.find((a) => a.name === addonNames[0]);
      if (addon) return addon.cost;
    }

    return this.getTierById(pokemon.tierId)?.cost;
  }

  getPokemonIds(): string[] {
    return Array.from(this.pokemon.keys());
  }

  getPokemonFormeIds(pokemonId: string): string[] | undefined {
    const formes = this.pokemon.get(pokemonId)?.formes;
    return formes?.length ? [...formes] : undefined;
  }

  getPokemonFormes(
    pokemonId: string,
  ): { id: string; name: string }[] | undefined {
    return this.getPokemonFormeIds(pokemonId)?.map((formeId) => ({
      id: formeId,
      name: this.ruleset.species.get(formeId)?.name ?? formeId,
    }));
  }

  applyTierUpdate(clientTiers: ClientTierInput[]): void {
    const validTiers = clientTiers.filter(
      (tier) => tier.name.toLowerCase() !== UNTIERED_TIER_NAME.toLowerCase(),
    );

    const existingTierMap = new Map(this.tiers.map((t) => [t.id, t]));
    const nextTiers = validTiers.map((tier) => {
      const existing = tier.id ? existingTierMap.get(tier.id) : undefined;
      return {
        input: tier,
        tier: new Tier({
          id: existing?.id ?? new Types.ObjectId().toString(),
          name: tier.name,
          cost: tier.cost,
          color: existing?.color,
        }),
      };
    });
    this.tiers = nextTiers.map((entry) => entry.tier);

    const nextBannedAbilities = new Set<string>();
    const pokemonMap = new Map<string, TierListPokemon>();

    for (const { input: tier, tier: resolvedTier } of nextTiers) {
      for (const pokemon of tier.pokemon) {
        pokemon.bannedAbilities?.forEach((ability) =>
          nextBannedAbilities.add(ability),
        );
        const existingData = this.pokemon.get(pokemon.id);
        pokemonMap.set(
          pokemon.id,
          new TierListPokemon({
            name: pokemon.name,
            tierId: resolvedTier.id,
            banned: pokemon.banned,
            notes: pokemon.notes,
            addons: existingData?.addons,
            formes: pokemon.formes?.length ? pokemon.formes : undefined,
          }),
        );
      }
    }

    const untieredClientTier = clientTiers.find(
      (tier) => tier.name.toLowerCase() === UNTIERED_TIER_NAME.toLowerCase(),
    );
    if (untieredClientTier) {
      for (const pokemon of untieredClientTier.pokemon) {
        if (!pokemon.banned) continue;
        pokemon.bannedAbilities?.forEach((ability) =>
          nextBannedAbilities.add(ability),
        );
        const existingData = this.pokemon.get(pokemon.id);
        pokemonMap.set(
          pokemon.id,
          new TierListPokemon({
            name: pokemon.name,
            tierId: existingData?.tierId,
            banned: true,
            notes: pokemon.notes,
            addons: existingData?.addons,
            formes: pokemon.formes?.length ? pokemon.formes : undefined,
          }),
        );
      }
    }

    this.pokemon = pokemonMap;
    this.banned = {
      moves: this.banned.moves,
      abilities: Array.from(nextBannedAbilities),
    };
  }
}

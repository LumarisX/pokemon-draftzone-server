import { getFormat, Format } from "@core/data/formats/formats";
import { getRuleset, Ruleset } from "@core/data/rulesets/rulesets";
import { Types } from "mongoose";

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
  /** Unset means untiered. */
  tierId?: string;
  notes?: string;
  addons?: TierListPokemonAddon[];
  banned?: boolean;
  /** Ids of the alternate formes this entry is allowed to run. */
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

export class TierListSettings {
  isPublic: boolean;
  shareToken?: string;

  constructor(props: { isPublic: boolean; shareToken?: string }) {
    this.isPublic = props.isPublic;
    this.shareToken = props.shareToken;
  }
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
  /** Absent for a tier the client just created; the server mints its id. */
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
  copiedFrom?: string;
  pokemon: Map<string, TierListPokemon>;
  tiers: Tier[];
  banned: { moves: string[]; abilities: string[] };
  format: Format;
  ruleset: Ruleset;
  settings: TierListSettings;
  collaborators: string[];

  constructor(props: {
    id: string;
    slug: string;
    name: string;
    description?: string;
    createdBy: string;
    copiedFrom?: string;
    pokemon: Map<string, TierListPokemon>;
    tiers: Tier[];
    banned: { moves: string[]; abilities: string[] };
    format: string;
    ruleset: string;
    settings: TierListSettings;
    collaborators: string[];
  }) {
    this.id = props.id;
    this.slug = props.slug;
    this.name = props.name;
    this.description = props.description;
    this.createdBy = props.createdBy;
    this.copiedFrom = props.copiedFrom;
    this.pokemon = props.pokemon;
    this.tiers = props.tiers;
    this.banned = props.banned;
    this.format = getFormat(props.format);
    this.ruleset = getRuleset(props.ruleset);
    this.settings = props.settings;
    this.collaborators = props.collaborators;
  }

  canEdit(sub?: string): boolean {
    if (!sub) return false;
    return this.createdBy === sub || this.collaborators.includes(sub);
  }

  getTierById(tierId: string | undefined): Tier | undefined {
    if (!tierId) return undefined;
    return this.tiers.find((tier) => tier.id === tierId);
  }

  getPokemonTier(pokemonId: string): Tier | undefined {
    return this.getTierById(this.pokemon.get(pokemonId)?.tierId);
  }

  /**
   * False for a Pokemon that is on a roster but no longer on this list —
   * removing an entry drops its cost to 0, which reads as "free" rather than
   * "illegal", so rosters flag it instead of quietly crediting the team.
   */
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

  /** Ids of the alternate formes this tier-list entry is allowed to run. */
  getPokemonFormeIds(pokemonId: string): string[] | undefined {
    const formes = this.pokemon.get(pokemonId)?.formes;
    return formes?.length ? [...formes] : undefined;
  }

  /**
   * The alternate formes this tier-list entry is allowed to run, resolved to
   * `{ id, name }` for display. Returns undefined when the entry has none, so
   * callers can spread it without emitting an empty array.
   */
  getPokemonFormes(
    pokemonId: string,
  ): { id: string; name: string }[] | undefined {
    return this.getPokemonFormeIds(pokemonId)?.map((formeId) => ({
      id: formeId,
      name: this.ruleset.species.get(formeId)?.name ?? formeId,
    }));
  }

  /**
   * Merges a client-submitted tier/pokemon layout into the current state,
   * preserving tier metadata (e.g. color) and pokemon addons that the client
   * payload doesn't carry. Banned pokemon submitted inside the "Untiered"
   * bucket keep their last known tier instead of losing it.
   */
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
            // Client-authoritative, so an empty selection clears the formes.
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

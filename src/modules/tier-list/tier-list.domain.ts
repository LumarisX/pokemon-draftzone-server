export const UNTIERED_TIER_NAME = "Untiered";

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
  tier: string;
  notes?: string;
  addons?: TierListPokemonAddon[];
  banned?: boolean;

  constructor(props: {
    name: string;
    tier: string;
    notes?: string;
    addons?: TierListPokemonAddon[];
    banned?: boolean;
  }) {
    this.name = props.name;
    this.tier = props.tier;
    this.notes = props.notes;
    this.addons = props.addons;
    this.banned = props.banned;
  }
}

export class Tier {
  name: string;
  cost: number;
  color?: string;

  constructor(props: { name: string; cost: number; color?: string }) {
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
};

export type ClientTierInput = {
  name: string;
  cost: number;
  pokemon: ClientTierPokemonInput[];
};

export class TierList {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  copiedFrom?: string;
  pokemon: Map<string, TierListPokemon>;
  tiers: Tier[];
  banned: { moves: string[]; abilities: string[] };
  pointTotal?: number;
  draftCount: DraftCount;
  format: string;
  ruleset: string;
  settings: TierListSettings;
  collaborators: string[];

  constructor(props: {
    id: string;
    name: string;
    description?: string;
    createdBy: string;
    copiedFrom?: string;
    pokemon: Map<string, TierListPokemon>;
    tiers: Tier[];
    banned: { moves: string[]; abilities: string[] };
    pointTotal?: number;
    draftCount: DraftCount;
    format: string;
    ruleset: string;
    settings: TierListSettings;
    collaborators: string[];
  }) {
    this.id = props.id;
    this.name = props.name;
    this.description = props.description;
    this.createdBy = props.createdBy;
    this.copiedFrom = props.copiedFrom;
    this.pokemon = props.pokemon;
    this.tiers = props.tiers;
    this.banned = props.banned;
    this.pointTotal = props.pointTotal;
    this.draftCount = props.draftCount;
    this.format = props.format;
    this.ruleset = props.ruleset;
    this.settings = props.settings;
    this.collaborators = props.collaborators;
  }

  canEdit(sub?: string): boolean {
    if (!sub) return false;
    return this.createdBy === sub || this.collaborators.includes(sub);
  }

  getTierByName(tierName: string): Tier | undefined {
    return this.tiers.find((tier) => tier.name === tierName);
  }

  getPokemonCost(
    pokemonId: string,
    addonNames?: string[],
  ): number | undefined {
    const pokemon = this.pokemon.get(pokemonId);
    if (!pokemon) return undefined;

    if (addonNames?.length && pokemon.addons) {
      const addon = pokemon.addons.find((a) => a.name === addonNames[0]);
      if (addon) return addon.cost;
    }

    return this.getTierByName(pokemon.tier)?.cost;
  }

  getPokemonIds(): string[] {
    return Array.from(this.pokemon.keys());
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

    const existingTierMap = new Map(this.tiers.map((t) => [t.name, t]));
    this.tiers = validTiers.map(
      (tier) =>
        new Tier({
          name: tier.name,
          cost: tier.cost,
          color: existingTierMap.get(tier.name)?.color,
        }),
    );

    const nextBannedAbilities = new Set<string>();
    const pokemonMap = new Map<string, TierListPokemon>();

    for (const tier of validTiers) {
      for (const pokemon of tier.pokemon) {
        pokemon.bannedAbilities?.forEach((ability) =>
          nextBannedAbilities.add(ability),
        );
        const existingData = this.pokemon.get(pokemon.id);
        pokemonMap.set(
          pokemon.id,
          new TierListPokemon({
            name: pokemon.name,
            tier: tier.name,
            banned: pokemon.banned,
            notes: pokemon.notes,
            addons: existingData?.addons,
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
            tier: existingData?.tier ?? UNTIERED_TIER_NAME,
            banned: true,
            notes: pokemon.notes,
            addons: existingData?.addons,
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

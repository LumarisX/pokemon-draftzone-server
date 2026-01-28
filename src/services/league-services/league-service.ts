import { Specie } from "@pkmn/data";
import { getBST } from "../../classes/specieUtil";
import { getRuleset } from "../../data/rulesets";
import { LeagueDivisionDocument } from "../../models/league/division.model";
import { League, LeagueDocument } from "../../models/league/league.model";
import { LeagueTeamDocument } from "../../models/league/team.model";
import tierListModel from "../../models/league/tier-list.model";

export function getRoles(sub: string | undefined) {
  if (!sub) return [];
  const roles = [];
  if (
    sub === "google-oauth2|110216442143129521066" ||
    sub === "oauth2|discord|491431053471383575"
  ) {
    roles.push("organizer");
  }
  return roles;
}

namespace TierList {
  export class TierGroup {
    label?: string;
    tiers: Tier[] = [];
    constructor(label?: string) {
      this.label = label;
    }

    toJSON() {
      return {
        label: this.label,
        tiers: this.tiers.map((tier) => tier.toJSON()),
      };
    }
  }

  export class Tier {
    name: string;
    index: number;
    pokemons: Pokemon[] = [];
    constructor(name: string, index: number) {
      this.name = name;
      this.index = index;
    }

    addPokemon(pokemon: TierList.Pokemon) {
      this.pokemons.push(pokemon);
    }

    toJSON() {
      return {
        name: this.name,
        pokemon: this.pokemons
          .sort((x, y) => y.bst - x.bst)
          .map((pokemon) => pokemon.toJSON()),
      };
    }
  }

  class SubPokemon {
    specie: Specie;
    bst: number;
    banned?: {
      moves?: string[];
      abilities?: string[];
      tera?: true;
    };
    constructor(
      specie: Specie,
      banned?: {
        moves?: string[];
        abilities?: string[];
        tera?: true;
      },
    ) {
      this.specie = specie;
      this.bst = getBST(this.specie);
      this.banned = banned;
    }

    toJSON() {
      return {
        id: this.specie.id,
        name: this.specie.name,
        stats: this.specie.baseStats,
        types: this.specie.types,
        bst: this.bst,
        banned: this.banned,
      };
    }
  }

  export class Pokemon extends SubPokemon {
    subPokemon?: SubPokemon[];
    drafted: string[];
    tier: Tier;
    constructor(
      specie: Specie,
      tier: Tier,
      drafted: string[] = [],
      banned?: {
        moves?: string[];
        abilities?: string[];
        tera?: true;
      },
    ) {
      super(specie, banned);
      this.drafted = drafted;
      this.tier = tier;
    }

    toJSON() {
      return {
        ...super.toJSON(),
        drafted: this.drafted,
        subPokemon: this.subPokemon?.map((pokemon) => pokemon.toJSON()),
      };
    }

    toDetails(): TierDetail[] {
      return [
        {
          name: this.specie.id,
          banned: this.banned,
          drafted: this.drafted.length > 0 ? this.drafted : undefined,
          tier: this.tier?.name,
        },
        ...(this.subPokemon
          ? this.subPokemon?.map((sub) => ({
              ref: this.specie.id,
              name: sub.specie.id,
              banned: sub.banned,
            }))
          : []),
      ];
    }

    addSubPokemon(pokemon: SubPokemon) {
      if (!this.subPokemon) this.subPokemon = [];
      this.subPokemon.push(pokemon);
    }
  }
}

type TierDetail = {
  name: string;
  banned?: {
    moves?: string[];
    abilities?: string[];
    tera?: true;
  };
  drafted?: string[];
} & ({ tier: string } | { ref: string });

export async function getTierList(league: League, showAll: boolean = false) {
  const tierList = await tierListModel.findById(league.tierList);
  if (!tierList) return null;

  const tiers: TierList.Tier[] = [];
  const tierGroup = new TierList.TierGroup("");
  const ruleset = getRuleset(tierList.ruleset);

  // Track which pokemon have been assigned to tiers
  const assignedPokemon = new Set<string>();

  // Build tiers from the tier list
  tierList.tiers.forEach((tierDetails, index) => {
    const tier = new TierList.Tier(tierDetails.name, index);
    tiers.push(tier);
    tierGroup.tiers.push(tier);

    tierList.pokemon.forEach((pokemonData, pokemonId) => {
      if (pokemonData.tier === tierDetails.name) {
        const specie = ruleset.species.get(pokemonId);
        if (specie) {
          const tierPokemon = new TierList.Pokemon(specie, tier);
          tier.addPokemon(tierPokemon);
          assignedPokemon.add(pokemonId);
        }
      }
    });
  });

  if (showAll) {
    // Create "Null" tier for all unassigned species
    const nullTier = new TierList.Tier("Null", tiers.length);
    tiers.push(nullTier);
    tierGroup.tiers.push(nullTier);

    // Add all species from ruleset that aren't already assigned
    for (const specie of ruleset.species) {
      if (!assignedPokemon.has(specie.id)) {
        const tierPokemon = new TierList.Pokemon(specie, nullTier);
        nullTier.addPokemon(tierPokemon);
      }
    }
  }

  return [tierGroup.toJSON()];
}

export async function getDrafted(
  league: LeagueDocument,
  divisionNames?: string | string[],
): Promise<{
  [key: string]: { pokemonId: string }[];
}> {
  const divisions: { [key: string]: { pokemonId: string }[] } = {};

  await league.populate({
    path: "divisions",
    populate: {
      path: "teams",
    },
  });

  let divisionsToProcess = league.divisions as LeagueDivisionDocument[];

  if (divisionNames) {
    const divisionNameSet = new Set(
      Array.isArray(divisionNames) ? divisionNames : [divisionNames],
    );
    divisionsToProcess = divisionsToProcess.filter((d) =>
      divisionNameSet.has(d.divisionKey),
    );
  }

  for (const division of divisionsToProcess) {
    divisions[division.name] = [];
    for (const team of division.teams as LeagueTeamDocument[]) {
      for (const draft of team.draft) {
        divisions[division.name].push({ pokemonId: draft.pokemonId });
      }
    }
  }

  return divisions;
}

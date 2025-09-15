import { Specie } from "@pkmn/data";
import { getBst } from "../../classes/specieUtil";
import tierListTemplateModel from "../../models/league/tier-list.model";
import { getRuleset } from "../../data/rulesets";

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
      }
    ) {
      this.specie = specie;
      this.bst = getBst(this.specie);
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
      }
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

export async function getTierListTemplate() {
  const template = await tierListTemplateModel.findById(
    "68c79d489e421c33de3d2b4f"
  );

  if (!template) {
    return null;
  }

  const tiers: TierList.Tier[] = [];

  const tierGroups = template.tierGroups.map((groupDetails) => {
    const tierGroup = new TierList.TierGroup(groupDetails.name);
    groupDetails.tiers.forEach((tierDetails) => {
      const tier = new TierList.Tier(tierDetails.name, tiers.length);
      tiers.push(tier);
      tierGroup.tiers.push(tier);

      tierDetails.pokemon.forEach((pokemonId) => {
        const specie = getRuleset("Gen9 NatDex").species.get(pokemonId);
        if (specie) {
          const tierPokemon = new TierList.Pokemon(specie, tier);
          tier.addPokemon(tierPokemon);
        }
      });
    });
    return tierGroup;
  });

  return tierGroups.map((tg) => tg.toJSON());
}

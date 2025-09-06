import { Specie } from "@pkmn/data";
import fs from "fs";
import { getBst } from "../classes/specieUtil";
import { getRuleset } from "./rulesets";

const path = "./src/data/pdbldetails.json";

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

type DraftDetails = {
  tierGroups: { tiers: string[]; label?: string }[];
  banned: {
    moves: string[];
    abilities: string[];
  };
  divisions: string[];
  tiers: TierDetail[];
};

function getDetailsFromJson(): DraftDetails {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

let cachedDetails: {
  tiers: TierList.Tier[];
  pokemons: TierList.Pokemon[];
  tierGroups: TierList.TierGroup[];
} | null = null;

export function getDetails(details?: DraftDetails) {
  if (cachedDetails && !details) {
    return { ...cachedDetails };
  }

  const tiers: TierList.Tier[] = [];

  const sourceDetails = details || getDetailsFromJson();

  const tierGroups = sourceDetails.tierGroups.map((groupDetails) => {
    const tierGroup = new TierList.TierGroup(groupDetails.label);
    groupDetails.tiers.forEach((tierName) => {
      const tier = new TierList.Tier(tierName, tiers.length);
      tiers.push(tier);
      tierGroup.tiers.push(tier);
    });
    return tierGroup;
  });

  const pokemons: TierList.Pokemon[] = [];
  const refList: {
    name: string;
    banned?: {
      moves?: string[];
      abilities?: string[];
      tera?: true;
    };
    drafted?: string[];
    ref: string;
  }[] = [];

  sourceDetails.tiers.forEach((pokemon) => {
    const specie = getRuleset("Gen9 NatDex").species.get(pokemon.name)!;
    if (!specie) throw new Error(`${pokemon.name} does not exist`);

    Object.values(specie.abilities).forEach((abilityName) => {
      if (
        sourceDetails.banned.abilities.includes(abilityName) &&
        !pokemon.banned?.abilities?.includes(abilityName)
      ) {
        if (!pokemon.banned) pokemon.banned = {};
        if (!pokemon.banned.abilities) pokemon.banned.abilities = [];
        pokemon.banned.abilities.push(abilityName);
      }
    });

    if ("tier" in pokemon) {
      const tier = tiers.find((tier) => tier.name === pokemon.tier);
      if (!tier)
        throw new Error(`${pokemon.tier} outside range for ${pokemon.name}`);
      const tierPokemon = new TierList.Pokemon(
        specie,
        tier,
        pokemon.drafted,
        pokemon.banned
      );
      tier.addPokemon(tierPokemon);
      pokemons.push(tierPokemon);
    } else {
      refList.push(pokemon);
    }
  });

  const processedDetails = { tiers, pokemons, tierGroups };

  if (!details) {
    cachedDetails = processedDetails;
  }

  return { ...processedDetails };
}

export function getTiers() {
  return getDetails().tierGroups.map((tg) => tg.toJSON());
}

export function getDivisions() {
  return getDetailsFromJson().divisions;
}

function writeDetails(details: DraftDetails) {
  fs.writeFileSync(path, JSON.stringify(details, null, 2));
}

export function setDrafted(
  pokemonId: string,
  division: string | null,
  setDrafted: boolean
) {
  const details = getDetailsFromJson();
  if (!division) throw new Error(`${division} is null.`);
  if (!details.divisions.includes(division))
    throw new Error(`${division} is an invalid division.`);
  const list = getDetails(details).pokemons;
  const foundMon = list.find((mon) => mon.specie.id === pokemonId);
  if (!foundMon) throw new Error(`${pokemonId} not found.`);
  if (setDrafted) {
    if (foundMon.drafted.includes(division))
      throw new Error(
        `${foundMon.specie.name} already drafted in ${division}.`
      );
    foundMon.drafted.push(division);
  } else {
    foundMon.drafted = foundMon.drafted.filter((d) => d !== division);
  }
  details.tiers = list.flatMap((mon) => mon.toDetails());
  writeDetails(details);
  cachedDetails = null;
  return foundMon.specie.name;
}

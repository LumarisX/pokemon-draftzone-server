import { Specie } from "@pkmn/data";
import { getBST } from "../../classes/specieUtil";
import { getRuleset } from "../../data/rulesets";
import { LeagueDivisionDocument } from "../../models/league/division.model";
import {
  LeagueTournament,
  LeagueTournamentDocument,
} from "../../models/league/tournament.model";
import { LeagueTeamDocument } from "../../models/league/team.model";
import tierListModel from "../../models/league/tier-list.model";

export function getRoles(sub: string | undefined) {
  if (!sub) return [];
  const roles = [];
  if (
    sub === "google-oauth2|110216442143129521066" || //lumaris
    sub === "oauth2|discord|491431053471383575" || //twang
    sub === "oauth2|discord|533998216450932756" || //turtlecode
    sub === "oauth2|discord|422843761765122071" //ian
  ) {
    roles.push("organizer");
  }
  return roles;
}

const UNTIERED_TIER_NAME = "Untiered";

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
        abilities: Object.values(this.specie.abilities),
        bst: this.bst,
        banned: this.banned,
      };
    }
  }

  export class Pokemon extends SubPokemon {
    subPokemon?: SubPokemon[];
    drafted: string[];
    tier: Tier;
    teraCost?: string;
    constructor(
      specie: Specie,
      tier: Tier,
      drafted: string[] = [],
      banned?: {
        moves?: string[];
        abilities?: string[];
        tera?: true;
      },
      teraCost?: string,
    ) {
      super(specie, banned);
      this.drafted = drafted;
      this.tier = tier;
      this.teraCost = teraCost;
    }

    toJSON() {
      return {
        ...super.toJSON(),
        drafted: this.drafted,
        teraCost: this.teraCost,
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

export async function getTierList(
  league: LeagueTournament,
  showAll: boolean = false,
) {
  const tierList = await tierListModel.findById(league.tierList);
  if (!tierList) return null;

  const tiers: TierList.Tier[] = [];
  const tierGroup = new TierList.TierGroup("");
  const ruleset = getRuleset(tierList.ruleset);
  const assignedPokemon = new Set<string>();
  tierList.tiers.forEach((tierDetails, index) => {
    const tier = new TierList.Tier(tierDetails.name, index);
    tiers.push(tier);
    tierGroup.tiers.push(tier);

    tierList.pokemon.forEach((pokemonData, pokemonId) => {
      if (pokemonData.tier === tierDetails.name) {
        const specie = ruleset.species.get(pokemonId);
        if (specie) {
          const tierPokemon = new TierList.Pokemon(
            specie,
            tier,
            undefined,
            undefined,
            pokemonData.teraTier,
          );
          tier.addPokemon(tierPokemon);
          assignedPokemon.add(pokemonId);
        }
      }
    });
  });

  if (showAll) {
    const nullTier = new TierList.Tier(UNTIERED_TIER_NAME, tiers.length);
    tiers.push(nullTier);
    tierGroup.tiers.push(nullTier);
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
  league: LeagueTournamentDocument,
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
        divisions[division.name].push({ pokemonId: draft.pokemon.id });
      }
    }
  }

  return divisions;
}

export async function updateTierList(
  league: LeagueTournament,
  clientTiers: Array<{
    name: string;
    pokemon: Array<{ id: string; name: string }>;
  }>,
) {
  const tierList = await tierListModel.findById(league.tierList);
  if (!tierList) throw new Error("Tier list not found");
  const serverTiers = clientTiers
    .filter(
      (tier) => tier.name.toLowerCase() !== UNTIERED_TIER_NAME.toLowerCase(),
    )
    .map((tier) => ({
      name: tier.name,
      ...(tierList.tiers.find((t) => t.name === tier.name) || {}),
    }));

  tierList.tiers = serverTiers;
  const pokemonMap = new Map<string, any>();
  clientTiers.forEach((tier) => {
    if (tier.name.toLowerCase() === UNTIERED_TIER_NAME.toLowerCase()) return;

    tier.pokemon.forEach((pokemon) => {
      const existingData = tierList.pokemon.get(pokemon.id);
      pokemonMap.set(pokemon.id, {
        name: pokemon.name,
        tier: tier.name,
        ...(existingData?.notes && { notes: existingData.notes }),
        ...(existingData?.teraTier && { teraTier: existingData.teraTier }),
        ...(existingData?.customData && {
          customData: existingData.customData,
        }),
      });
    });
  });

  tierList.pokemon = pokemonMap;
  await tierList.save();

  return tierList;
}

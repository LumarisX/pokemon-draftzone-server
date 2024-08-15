import { ID, Specie, toID, TypeName } from "@pkmn/data";
import {
  AbilityName,
  Condition,
  Dex,
  EggGroup,
  EvoType,
  FormeName,
  GenderName,
  GenerationNum,
  ItemName,
  MoveName,
  Nonstandard,
  SpeciesAbility,
  SpeciesName,
  SpeciesTag,
  StatsTable,
  Tier,
} from "@pkmn/dex-types";
import { Ruleset } from "../data/rulesets";
import { getName } from "../services/data-services/pokedex.service";
import { PokemonData } from "../models/pokemon.schema";

export interface PokemonOptions {
  shiny?: boolean;
  capt?: {
    tera?: TypeName[];
    z?: boolean;
  };
}

export interface Pokemon extends PokemonOptions {
  id: ID;
  name: string;
}

export type PokemonFormData = {
  id: ID;
  shiny?: boolean;
  name?: string;
  capt?: {
    tera?: { [key: string]: boolean };
    z?: boolean;
    teraCheck: boolean;
  };
  captCheck?: boolean;
};

export class DraftSpecies implements Specie, Pokemon {
  id!: ID;
  name!: SpeciesName;
  fullname!: string;
  exists!: boolean;
  num!: number;
  gen!: GenerationNum;
  shortDesc!: string;
  desc!: string;
  isNonstandard!: Nonstandard | null;
  duration?: number | undefined;
  effectType!: "Pokemon";
  kind!: "Species";
  baseStats!: StatsTable;
  baseSpecies!: SpeciesName;
  baseForme!: "" | FormeName;
  forme!: "" | FormeName;
  abilities!: SpeciesAbility<"" | AbilityName>;
  types!: [TypeName] | [TypeName, TypeName];
  prevo?: "" | SpeciesName | undefined;
  evos?: SpeciesName[] | undefined;
  nfe!: boolean;
  eggGroups!: EggGroup[];
  weightkg!: number;
  weighthg!: number;
  tags!: SpeciesTag[];
  unreleasedHidden!: boolean | "Past";
  maleOnlyHidden!: boolean;
  inheritsFrom!: ID;
  tier!: Tier.Singles | Tier.Other;
  doublesTier!: Tier.Doubles;
  changesFrom?: SpeciesName | undefined;
  cosmeticFormes?: SpeciesName[] | undefined;
  otherFormes?: SpeciesName[] | undefined;
  formeOrder?: SpeciesName[] | undefined;
  formes?: SpeciesName[] | undefined;
  genderRatio!: { M: number; F: number };
  isMega?: boolean | undefined;
  isPrimal?: boolean | undefined;
  battleOnly?: SpeciesName | SpeciesName[] | undefined;
  canGigantamax?: MoveName | undefined;
  gmaxUnreleased?: boolean | undefined;
  cannotDynamax?: boolean | undefined;
  requiredAbility?: AbilityName | undefined;
  requiredItem?: ItemName | undefined;
  requiredItems?: ItemName[] | undefined;
  requiredMove?: MoveName | undefined;
  gender?: GenderName | undefined;
  maxHP?: number | undefined;
  evoMove?: MoveName | undefined;
  evoItem?: string | undefined;
  evoRegion?: "Alola" | "Galar" | undefined;
  evoLevel?: number | undefined;
  evoCondition?: string | undefined;
  evoType?: EvoType | undefined;
  condition?: Partial<Condition> | undefined;
  canHatch!: boolean;
  dex!: Dex;
  shiny?: boolean | undefined;
  capt?: { tera?: TypeName[]; z?: boolean } | undefined;
  ruleset: Ruleset;
  get formeNum(): number {
    throw new Error("Method not implemented.");
  }
  toString!: () => SpeciesName;
  toJSON!: () => { [key: string]: any };

  constructor(species: Specie, data: PokemonOptions, ruleset: Ruleset) {
    Object.assign(this, species);
    this.toString = species.toString;
    this.toJSON = species.toJSON;
    this.shiny = data.shiny;
    this.capt = data.capt;
    this.ruleset = ruleset;
  }

  toPokemonData(): PokemonData {
    return {
      id: this.id,
      name: this.name,
      shiny: this.shiny,
      capt: this.capt,
    };
  }
}

export class PokemonBuilder {
  data: Pokemon;
  error: string | undefined;

  constructor(ruleset: Ruleset, pokemonData: PokemonFormData) {
    this.data = {
      id: toID(pokemonData.id),
      name: getName(ruleset, pokemonData.id),
      shiny: pokemonData.shiny,
    };

    // if (!inDex(pokemonData.id)) {
    //   this.error = `${this.data.name} not found in the pokedex`;
    //   return;
    // }

    const { captCheck } = pokemonData;
    if (captCheck) {
      this.data.capt = {
        z: pokemonData.capt?.z ? true : undefined,
        tera: pokemonData.capt?.teraCheck
          ? (Object.keys(pokemonData.capt?.tera || {}).filter(
              (type) => pokemonData.capt!.tera![type]
            ) as TypeName[])
          : undefined,
      };
    }
  }
}

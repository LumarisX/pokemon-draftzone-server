import { Ruleset } from "@core/data/rulesets/rulesets";
import { PDZMove } from "@modules/move/move.domain";
import { DraftOptions, PDZPokemon } from "@modules/pokemon/pokemon.domain";
import {
  createSet,
  effectiveEvs,
  effectiveIvs,
  isLegal,
  LegalityIssue,
  PokemonSet,
  StatSystem,
  validateSet,
} from "@pdz/sets";
import { ID, NatureName, Specie, StatsTable } from "@pkmn/data";
import { AbilityName, GenderName, ItemName, TypeName } from "@pkmn/dex-types";

export type SetOptions = DraftOptions & {
  level?: number;
  moves?: ID[];
  ivs?: Partial<StatsTable>;
  evs?: Partial<StatsTable>;
  sps?: Partial<StatsTable>;
  gender?: GenderName;
  nature?: ID;
  item?: ID;
  ability?: ID;
  happiness?: number;
  pokeball?: string;
  hpType?: TypeName;
  dynamaxLevel?: number;
  gigantamax?: boolean;
  teraType?: TypeName;
};

export class PDZPokemonSet extends PDZPokemon {
  level: number;
  private _ivs: StatsTable;
  private _evs: StatsTable;
  sps: StatsTable;
  gender: GenderName;
  ability: AbilityName;
  moves: PDZMove[];
  nature?: NatureName;
  item?: ItemName;
  happiness?: number;
  pokeball?: string;
  hpType?: TypeName;
  dynamaxLevel?: number;
  gigantamax?: boolean;
  teraType?: TypeName;

  constructor(
    pokemonData: ID | ({ id: string } & SetOptions) | (Specie & SetOptions),
    ruleset: Ruleset,
  ) {
    super(pokemonData, ruleset);
    const setData: SetOptions =
      typeof pokemonData === "string" ? {} : pokemonData;

    const defaults = createSet({ id: this.id });

    this.level = setData.level ?? defaults.level;
    this.sps = { ...defaults.sps, ...setData.sps };
    this._ivs = { ...defaults.ivs, ...setData.ivs };
    this._evs = { ...defaults.evs, ...setData.evs };
    this.gender =
      setData.gender ??
      (this.genderRatio.M > 0 ? "M" : this.genderRatio.F > 0 ? "F" : "N");
    this.ability =
      (setData.ability
        ? ruleset.abilities.get(setData.ability)?.name
        : undefined) ?? (this.getAbilities()[0] as AbilityName);
    this.item = setData.item
      ? ruleset.items.get(setData.item)?.name
      : undefined;
    this.nature = setData.nature
      ? ruleset.natures.get(setData.nature)?.name
      : undefined;
    this.happiness = setData.happiness;
    this.pokeball = setData.pokeball;
    this.hpType = setData.hpType;
    this.dynamaxLevel = setData.dynamaxLevel;
    this.gigantamax = setData.gigantamax;
    this.teraType = setData.teraType;
    this.moves = (setData.moves ?? []).map(
      (moveId) => new PDZMove(moveId, ruleset),
    );
  }

  get statRules(): StatSystem {
    return this.ruleset.statRules;
  }

  toShared(): PokemonSet {
    return createSet({
      id: this.id,
      level: this.level,
      gender: this.gender === "N" ? "" : this.gender,
      ability: this.ability ? toId(this.ability) : undefined,
      item: this.item ? toId(this.item) : undefined,
      nature: this.nature,
      teraType: this.teraType,
      moves: this.moves.map((move) => move.id),
      ivs: this._ivs,
      evs: this._evs,
      sps: this.sps,
      happiness: this.happiness,
      dynamaxLevel: this.dynamaxLevel,
      gigantamax: this.gigantamax,
      hpType: this.hpType,
      pokeball: this.pokeball,
    });
  }

  get stats(): StatsTable {
    const nature = this.nature
      ? this.ruleset.natures.get(this.nature)
      : undefined;
    return Array.from(this.ruleset.stats).reduce((acc, stat) => {
      acc[stat] = this.ruleset.stats.calc(
        stat,
        this.baseStats[stat],
        this.ivs[stat],
        this.evs[stat],
        this.level,
        nature,
      );
      return acc;
    }, {} as StatsTable);
  }

  get ivs(): StatsTable {
    return effectiveIvs(this.toShared(), this.statRules);
  }

  get evs(): StatsTable {
    return effectiveEvs(this.toShared(), this.statRules);
  }

  get issues(): LegalityIssue[] {
    return validateSet(this.toShared(), this.statRules);
  }

  get isLegal(): boolean {
    return isLegal(this.toShared(), this.statRules);
  }
}

function toId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

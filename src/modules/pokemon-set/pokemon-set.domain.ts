import { Ruleset } from "@core/data/rulesets/rulesets";
import { PDZMove } from "@modules/move/move.domain";
import { DraftOptions, PDZPokemon } from "@modules/pokemon/pokemon.domain";
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

const MAX_IV = 31;
const DEFAULT_IVS: StatsTable = {
  hp: MAX_IV,
  atk: MAX_IV,
  def: MAX_IV,
  spa: MAX_IV,
  spd: MAX_IV,
  spe: MAX_IV,
};

const MAX_EV = 252;
const MAX_TOTAL_EVS = 512;
const DEFAULT_EVS: StatsTable = {
  hp: 0,
  atk: 0,
  def: 0,
  spa: 0,
  spd: 0,
  spe: 0,
};

const MAX_SP = 32;
const MAX_TOTAL_SPS = 66;
const DEFAULT_SPS: StatsTable = {
  hp: 0,
  atk: 0,
  def: 0,
  spa: 0,
  spd: 0,
  spe: 0,
};

function spsToEv(sps: number): number {
  return sps === 0 ? 0 : sps * 8 - 4;
}

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

    this.level = setData.level ?? 100;
    this.sps = { ...DEFAULT_SPS, ...setData.sps };
    this._ivs = { ...DEFAULT_IVS, ...setData.ivs };
    this._evs = { ...DEFAULT_EVS, ...setData.evs };
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
    if (this.ruleset.useStatPoints) return DEFAULT_IVS;
    return this._ivs;
  }

  get evs(): StatsTable {
    if (!this.ruleset.useStatPoints) return this._evs;
    return Array.from(this.ruleset.stats).reduce((acc, stat) => {
      acc[stat] = spsToEv(this.sps![stat]);
      return acc;
    }, {} as StatsTable);
  }

  get isLegal(): boolean {
    if (this.level < 0 || this.level > 100 || !Number.isInteger(this.level)) {
      return false;
    }
    if (this.ruleset.useStatPoints) {
      const sps = Object.values(this.sps);
      const totalSPs = sps.reduce((sum, sp) => sum + sp, 0);
      if (totalSPs > MAX_TOTAL_SPS) return false;
      if (sps.some((sp) => sp > MAX_SP || sp < 0 || !Number.isInteger(sp)))
        return false;
    } else {
      const evs = Object.values(this._evs);
      const totalEVs = evs.reduce((sum, ev) => sum + ev, 0);
      if (totalEVs > MAX_TOTAL_EVS) return false;
      if (evs.some((ev) => ev > MAX_EV || ev < 0 || !Number.isInteger(ev)))
        return false;
      const ivs = Object.values(this._ivs);
      if (ivs.some((iv) => iv > MAX_IV || iv < 0 || !Number.isInteger(iv)))
        return false;
    }
    return true;
  }
}

export interface PokemonDataDto {
  id: string;
  name: string;
  baseSpecies: string;
  gen: number;
  isNonstandard: string;
  types: string[];
  abilities: string[];
  weaks: string[];
  resists: string[];
  immunities: string[];
  baseStats: {
    hp: number;
    atk: number;
    def: number;
    spa: number;
    spd: number;
    spe: number;
  };
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
  weightkg: number;
  tier: string;
  natDexTier: string;
  doublesTier: string;
  eggGroups: string[];
  nfe: boolean;
  evolved: boolean;
  isMega: boolean;
  isPrimal: boolean;
  isGigantamax: boolean;
  prevo: string;
  evos: string[];
  requiredAbility: string;
  requiredItem?: string[];
  requiredMove: string;
  coverage: string[];
  learns: string[];
  num: number;
  tags: string[];
  bst: number;
  cst: number;
}

export interface RandomPokemonDto {
  id: string;
  name: string;
  tier: string;
  types: string[];
  baseStats: {
    hp: number;
    atk: number;
    def: number;
    spa: number;
    spd: number;
    spe: number;
  };
  abilities: string[];
  level: string;
}

export interface PokemonMoveDto {
  id: string;
  name: string;
  type: string;
  category: string;
  basePower: number;
  accuracy: number | boolean;
  pp: number;
  priority: number;
  target: string;
}

export interface PokemonFormeDto {
  id: string;
  name: string;
}

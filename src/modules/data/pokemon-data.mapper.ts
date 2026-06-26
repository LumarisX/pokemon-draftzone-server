import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import {
  PokemonDataDto,
  PokemonFormeDto,
  RandomPokemonDto,
} from "./pokemon-data.dto";

export class PokemonDataMapper {
  private static readonly IMMUNITY_LABEL_MAP: Record<string, string> = {
    slp: "Sleep",
    par: "Paralysis",
    psn: "Poison",
    tox: "Badly Poisoned",
    brn: "Burn",
    frz: "Freeze",
    sandstorm: "Sandstorm",
    hail: "Hail",
    powder: "Powder",
  };

  public static async toDto(specie: PDZPokemon): Promise<PokemonDataDto> {
    const coverage = await specie.coverage();
    const baseStats = specie.baseStats;
    const learnset = await specie.learnset();

    return {
      id: specie.id,
      name: specie.name,
      baseSpecies: specie.baseSpecies,
      gen: specie.gen,
      isNonstandard: specie.isNonstandard ?? "",
      types: [...specie.types],
      abilities: specie.getAbilities(),
      weaks: specie.getWeak(),
      resists: [...specie.getResists()],
      immunities: specie
        .getImmune()
        .map((imm) => this.IMMUNITY_LABEL_MAP[imm] || imm),
      baseStats,
      hp: baseStats.hp,
      atk: baseStats.atk,
      def: baseStats.def,
      spa: baseStats.spa,
      spd: baseStats.spd,
      spe: baseStats.spe,
      weightkg: specie.weightkg,
      tier: specie.tier,
      natDexTier: specie.natDexTier,
      doublesTier: specie.doublesTier,
      eggGroups: [...specie.eggGroups],
      nfe: specie.nfe,
      evolved: !specie.nfe,
      isMega: Boolean(specie.isMega),
      isPrimal: Boolean(specie.isPrimal),
      isGigantamax: Boolean(specie.isGigantamax),
      prevo: specie.prevo ?? "",
      evos: specie.evos ?? [],
      requiredAbility: specie.requiredAbility ?? "",
      requiredItem: specie.requiredItem
        ? [specie.requiredItem]
        : specie.requiredItems,
      requiredMove: specie.requiredMove ?? "",
      coverage: [
        ...new Set(
          [...coverage.physical, ...coverage.special].map((move) => move.type),
        ),
      ],
      learns: learnset.map((move) => move.name),
      num: specie.num,
      tags: [...specie.tags],
      bst: specie.bst,
      cst: specie.cst,
    };
  }

  public static toRandomDto(
    specie: PDZPokemon,
    level: number,
  ): RandomPokemonDto {
    return {
      id: specie.id,
      name: specie.name,
      tier: specie.tier,
      types: [...specie.types],
      baseStats: specie.baseStats,
      abilities: specie.getAbilities(),
      level: level.toString(),
    };
  }

  public static toFormeDto(specie: PDZPokemon): PokemonFormeDto {
    return { id: specie.id, name: specie.name };
  }
}

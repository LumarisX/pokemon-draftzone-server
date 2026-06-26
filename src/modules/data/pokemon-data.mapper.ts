import { DraftPokemon } from "@modules/draft-pokemon/draft-pokemon.domain";
import { PokemonDataDto } from "./pokemon-data.dto";

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

  public static async toDto(specie: DraftPokemon): Promise<PokemonDataDto> {
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
}

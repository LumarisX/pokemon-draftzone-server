import {
  Ability,
  ID,
  Item,
  Nature,
  NatureName,
  StatID,
  StatsTable,
  TypeName,
} from "@pkmn/data";
import { DraftSpecies } from "./pokemon";

export namespace Teambuilder {
  export class Pokemon {
    ivs: StatsTable;
    evs: StatsTable;
    level: number;
    nature: Nature;
    ability: Ability;
    item?: Item;
    teraType: TypeName;
    constructor(
      public specie: DraftSpecies,
      options?: {
        evs?: Partial<StatsTable>;
        ivs?: Partial<StatsTable>;
        level?: number;
        nature?: NatureName;
        ability?: ID;
        item?: ID;
        teraType: TypeName;
      }
    ) {
      this.ivs = {
        hp: 31,
        atk: 31,
        def: 31,
        spa: 31,
        spd: 31,
        spe: 31,
        ...options?.ivs,
      };
      this.evs = {
        hp: 0,
        atk: 0,
        def: 0,
        spa: 0,
        spd: 0,
        spe: 0,
        ...options?.evs,
      };
      this.level = options?.level ?? 100;
      const natureName = options?.nature ?? "Serious";
      this.nature =
        this.specie.ruleset.gen.natures.get(natureName) ??
        this.throwError(`Invalid Nature: ${natureName}`);
      const abilityName = options?.ability ?? this.specie.abilities[0];
      this.ability =
        this.specie.ruleset.gen.abilities.get(abilityName) ??
        this.throwError(`Invalid Ability: ${abilityName}`);
      if (options?.item)
        this.item = this.specie.ruleset.gen.items.get(options.item);

      this.teraType = options?.teraType ?? this.specie.types[0];
    }

    private throwError(message: string): never {
      throw new Error(message);
    }

    isLegal(): boolean {
      for (const stat in this.ivs) {
        const iv = this.ivs[stat as StatID];
        const ev = this.evs[stat as StatID];
        if (iv < 0 || iv > 31) return false;
        if (ev < 0 || ev > 255) return false;
      }
      const totalEvs = Object.values(this.evs).reduce((sum, ev) => sum + ev, 0);
      if (totalEvs > 510) return false;

      return true;
    }

    get stats(): StatsTable {
      const stats: StatsTable = {
        hp: 0,
        atk: 0,
        def: 0,
        spa: 0,
        spd: 0,
        spe: 0,
      };
      (Object.keys(stats) as StatID[]).forEach((stat) => {
        stats[stat] = this.specie.ruleset.gen.stats.calc(
          stat,
          this.specie.baseStats[stat],
          this.ivs[stat],
          this.evs[stat],
          this.level,
          this.nature
        );
      });
      console.log(this.level, stats);

      return stats;
    }
  }
}

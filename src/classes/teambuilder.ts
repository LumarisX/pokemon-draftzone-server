import {
  Ability,
  ID,
  Item,
  MoveName,
  Nature,
  NatureName,
  StatID,
  StatsTable,
  TypeName,
} from "@pkmn/data";
import { DraftSpecies } from "./pokemon";
import { getEffectivePower } from "../services/data-services/move.service";

export namespace Teambuilder {
  export class Pokemon {
    ivs: StatsTable;
    evs: StatsTable;
    level: number;
    nature: Nature;
    ability: Ability;
    item?: Item;
    moves: [ID | null, ID | null, ID | null, ID | null];
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
        this.specie.ruleset.natures.get(natureName) ??
        this.throwError(`Invalid Nature: ${natureName}`);
      const abilityName = options?.ability ?? this.specie.abilities[0];
      this.ability =
        this.specie.ruleset.abilities.get(abilityName) ??
        this.throwError(`Invalid Ability: ${abilityName}`);
      if (options?.item)
        this.item = this.specie.ruleset.items.get(options.item);
      this.moves = [null, null, null, null];
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
        stats[stat] = this.specie.ruleset.stats.calc(
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

    async toBuilder() {
      return {
        name: this.specie.name,
        evs: this.evs,
        ivs: this.ivs,
        ability: this.ability.name,
        abilities: Object.values(this.specie.abilities).map((abilityName) => ({
          name: abilityName,
          id: this.specie.ruleset.abilities.get(abilityName)?.id,
        })),
        level: this.level,
        moves: this.moves,
        nature: this.nature.name,
        item: this.item?.name,
        teraType: this.teraType,
        stats: this.stats,
        learnset: (await this.specie.learnset()).map((move) => ({
          id: move.id,
          type: move.type,
          name: move.name,
        })),
      };
    }
  }
}

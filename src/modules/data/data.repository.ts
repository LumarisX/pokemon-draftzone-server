import { Formats } from "@core/data/formats/formats";
import { getRuleset, Rulesets } from "@core/data/rulesets/rulesets";
import { DraftPokemon } from "@modules/draft-pokemon/draft-pokemon.domain";
import { Injectable } from "@nestjs/common";

@Injectable()
export class DataRepository {
  getFormats() {
    return Object.entries(Formats).map(([groupName, groupData]) => [
      groupName,
      Object.entries(groupData).flatMap(([formatKey, formatData]) => ({
        name: formatKey,
        id: formatData.name,
        desc: formatData.desc,
      })),
    ]);
  }

  getFormatsLegacy(): string[] {
    return Object.values(Formats).flatMap((groupData) =>
      Object.values(groupData).flatMap((formatData) => formatData.name),
    );
  }

  getRulesets() {
    return Object.entries(Rulesets).map(([groupName, rulesetgroup]) => [
      groupName,
      Object.entries(rulesetgroup).flatMap(([rulesetName, rulesetData]) => ({
        name: rulesetName,
        id: rulesetData.id,
        desc: rulesetData.desc,
      })),
    ]);
  }

  getRulesetsLegacy(): string[] {
    return [
      Rulesets["Gen 9"],
      Rulesets["Gen 8"],
      Rulesets["Older Gens"],
    ].flatMap((rulesetgroup) =>
      Object.values(rulesetgroup).map((ruleset) => ruleset.id),
    );
  }

  getSpeciesForRuleset(rulesetId: string): DraftPokemon[] {
    const ruleset = getRuleset(rulesetId);
    return Array.from(ruleset.species).map((s) => new DraftPokemon(s, ruleset));
  }
}

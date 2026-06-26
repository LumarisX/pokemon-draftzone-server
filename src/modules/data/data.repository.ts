import { _getFormats, getFormats } from "@core/data/formats/formats";
import {
  getRuleset,
  getRulesets,
  getRulesetsGrouped,
} from "@core/data/rulesets/rulesets";
import { DraftPokemon } from "@modules/draft-pokemon/draft-pokemon.domain";
import { Injectable } from "@nestjs/common";

@Injectable()
export class DataRepository {
  getFormats() {
    return _getFormats();
  }

  getFormatsLegacy(): string[] {
    return getFormats();
  }

  getRulesets() {
    return getRulesetsGrouped();
  }

  getRulesetsLegacy(): string[] {
    return getRulesets();
  }

  getSpeciesForRuleset(rulesetId: string): DraftPokemon[] {
    const ruleset = getRuleset(rulesetId);
    return Array.from(ruleset.species).map((s) => new DraftPokemon(s, ruleset));
  }
}

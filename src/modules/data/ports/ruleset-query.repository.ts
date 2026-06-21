import { DraftPokemon } from "@modules/draft-pokemon/draft-pokemon.domain";

export abstract class RulesetQueryRepository {
  abstract getFormats(): any[];
  abstract getFormatsLegacy(): string[];
  abstract getRulesets(): any[];
  abstract getRulesetsLegacy(): string[];
  abstract getSpeciesForRuleset(rulesetId: string): DraftPokemon[];
}

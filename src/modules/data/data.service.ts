import { Injectable } from "@nestjs/common";
import { PokemonDataDto } from "./dto/pokemon-data.dto";
import { PokemonDataMapper } from "./mapper/pokemon-data.mapper";
import { RulesetQueryRepository } from "./ports/ruleset-query.repository";

@Injectable()
export class DataService {
  constructor(private readonly dataRepository: RulesetQueryRepository) {}

  async getFormats() {
    return this.dataRepository.getFormats();
  }

  async getFormatsLegacy(): Promise<string[]> {
    return this.dataRepository.getFormatsLegacy();
  }

  async getRulesets() {
    return this.dataRepository.getRulesets();
  }

  async getRulesetsLegacy(): Promise<string[]> {
    return this.dataRepository.getRulesetsLegacy();
  }

  async getPokemonList(rulesetId: string): Promise<PokemonDataDto[]> {
    const speciesInstances =
      this.dataRepository.getSpeciesForRuleset(rulesetId);

    return Promise.all(
      speciesInstances.map((specie) => PokemonDataMapper.toDto(specie)),
    );
  }
}

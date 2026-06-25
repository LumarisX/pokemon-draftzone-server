import { Injectable } from "@nestjs/common";
import { PokemonDataDto } from "./pokemon-data.dto";
import { DataRepository } from "./data.repository";
import { PokemonDataMapper } from "./pokemon-data.mapper";

@Injectable()
export class DataService {
  constructor(private readonly dataRepository: DataRepository) {}

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

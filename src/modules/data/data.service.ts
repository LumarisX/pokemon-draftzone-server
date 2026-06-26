import { getFormat } from "@core/data/formats/formats";
import { Injectable } from "@nestjs/common";
import {
  PokemonDataDto,
  PokemonFormeDto,
  PokemonMoveDto,
  RandomPokemonDto,
} from "./pokemon-data.dto";
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

  async getRandomPokemon(
    rulesetId: string,
    count: number,
    formatId: string,
    options: { tier?: string; banned?: string[] } = {},
  ): Promise<RandomPokemonDto[]> {
    const format = getFormat(formatId);
    const species = this.dataRepository.getRandomSpecies(
      rulesetId,
      count,
      options,
    );

    return species.map((specie) =>
      PokemonDataMapper.toRandomDto(specie, format.level),
    );
  }

  async getPokemonMoves(
    rulesetId: string,
    pokemonId: string,
  ): Promise<PokemonMoveDto[]> {
    const learnset = await this.dataRepository.getMovesForPokemon(
      rulesetId,
      pokemonId,
    );

    return learnset.map((move) => ({
      id: move.id,
      name: move.name,
      type: move.type,
      category: move.category,
      basePower: move.basePower,
      accuracy: move.accuracy,
      pp: move.pp,
      priority: move.priority,
      target: move.target,
    }));
  }

  async getPokemonFormes(
    rulesetId: string,
    pokemonId: string,
  ): Promise<PokemonFormeDto[]> {
    const formes = this.dataRepository.getFormesForPokemon(
      rulesetId,
      pokemonId,
    );

    return formes.map((forme) => PokemonDataMapper.toFormeDto(forme));
  }
}

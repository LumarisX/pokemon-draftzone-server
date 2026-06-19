import { ID, Specie } from "@pkmn/data";
import { Ruleset } from "@core/data/rulesets/rulesets";
import { DraftSpecie, PokemonOptions } from "./pokemon.domain";
import { PokemonDto } from "./pokemon.dto";
import { PokemonData } from "./pokemon.schema";

export type PokemonInput =
  | ID
  | PokemonData
  | PokemonDto
  | (Specie & PokemonOptions);

export class PokemonMapper {
  toDomain(input: PokemonInput, ruleset: Ruleset): DraftSpecie {
    return new DraftSpecie(input, ruleset);
  }

  toDomainList(inputs: PokemonInput[], ruleset: Ruleset): DraftSpecie[] {
    return DraftSpecie.getTeam(inputs, ruleset);
  }

  toDto(domain: DraftSpecie): PokemonDto {
    return domain.toClient();
  }

  toData(domain: DraftSpecie): PokemonData {
    return domain.toData();
  }

  inputToDto(input: PokemonInput, ruleset: Ruleset): PokemonDto {
    return this.toDto(this.toDomain(input, ruleset));
  }

  inputToData(input: PokemonInput, ruleset: Ruleset): PokemonData {
    return this.toData(this.toDomain(input, ruleset));
  }
}

export const pokemonMapper = new PokemonMapper();
